const SPOONACULAR_BASE = "https://api.spoonacular.com";
const cache = new Map();

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=1800");
  res.end(JSON.stringify(data));
}

function stripHtml(value = "") {
  return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function nutrient(recipe, name) {
  const item = recipe?.nutrition?.nutrients?.find(n => n.name?.toLowerCase() === name.toLowerCase());
  return Math.round(Number(item?.amount) || 0);
}

function mapRecipe(recipe) {
  const steps = (recipe.analyzedInstructions || []).flatMap(group => group.steps || []).map(x => x.step).filter(Boolean);
  return {
    id: recipe.id,
    name: recipe.title || "Meal",
    description: stripHtml(recipe.summary || ""),
    ingredients: (recipe.extendedIngredients || []).map(x => x.original || x.name).filter(Boolean).join(", "),
    calories: nutrient(recipe, "Calories"),
    protein: nutrient(recipe, "Protein"),
    carbs: nutrient(recipe, "Carbohydrates"),
    fats: nutrient(recipe, "Fat"),
    fiber: nutrient(recipe, "Fiber"),
    prepTime: recipe.readyInMinutes ? `${recipe.readyInMinutes} min` : "—",
    difficulty: recipe.readyInMinutes <= 25 ? "Easy" : recipe.readyInMinutes <= 50 ? "Medium" : "Advanced",
    instructions: steps.length ? steps.slice(0, 8) : [stripHtml(recipe.instructions || "Follow the recipe source instructions.")],
    image: recipe.image || "",
    imageKeyword: recipe.title || "healthy meal",
    sourceUrl: recipe.sourceUrl || "",
    alternative: "Use the Replace button to fetch another recipe with similar calories."
  };
}

function dietValue(type = "") {
  const value = String(type).toLowerCase();
  if (value.includes("نبات") || value.includes("vegetarian")) return "vegetarian";
  if (value.includes("كيتو") || value.includes("keto")) return "ketogenic";
  return "";
}

async function fetchRecipes({ targetCalories, count, dietType, avoid, query = "", offset = 0 }) {
  const apiKey = process.env.SPOONACULAR_API_KEY;
  if (!apiKey) throw new Error("SPOONACULAR_API_KEY is not configured in Vercel.");
  const perMeal = Math.max(180, Math.round(targetCalories));
  const params = new URLSearchParams({
    apiKey,
    number: String(Math.min(Math.max(count, 1), 50)),
    offset: String(offset),
    addRecipeNutrition: "true",
    fillIngredients: "true",
    instructionsRequired: "true",
    minCalories: String(Math.max(100, Math.round(perMeal * 0.72))),
    maxCalories: String(Math.round(perMeal * 1.28)),
    sort: "random"
  });
  const diet = dietValue(dietType);
  if (diet) params.set("diet", diet);
  if (avoid) params.set("excludeIngredients", avoid);
  if (query) params.set("query", query);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(`${SPOONACULAR_BASE}/recipes/complexSearch?${params}`, { signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Meals API error (${response.status})`);
    return (data.results || []).map(mapRecipe);
  } finally { clearTimeout(timer); }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const mode = body.mode || "plan";
    const key = JSON.stringify({ mode, ...body, nonce: mode === "replace" ? Date.now() >> 15 : 0 });
    const cached = cache.get(key);
    if (cached && Date.now() - cached.time < 15 * 60 * 1000) return send(res, 200, cached.data);

    if (mode === "replace") {
      const meals = await fetchRecipes({
        targetCalories: Number(body.calories) || 500,
        count: 8,
        dietType: body.user?.dietType,
        avoid: body.user?.excludedFoodsAndAllergies,
        query: body.query || "",
        offset: Math.floor(Math.random() * 20)
      });
      const oldId = Number(body.excludeId);
      const meal = meals.find(x => x.id !== oldId) || meals[0];
      if (!meal) throw new Error("No replacement recipe matched your filters.");
      const data = { meal };
      cache.set(key, { time: Date.now(), data });
      return send(res, 200, data);
    }

    const user = body.user || {};
    const calc = body.calc || {};
    const daysCount = 7;
    const mealsPerDay = Math.min(5, Math.max(2, Number(user.mealsPerDay) || 3));
    const needed = daysCount * mealsPerDay;
    const perMealCalories = (Number(calc.targetCalories) || 2000) / mealsPerDay;
    let recipes = await fetchRecipes({
      targetCalories: perMealCalories,
      count: Math.min(50, needed + 10),
      dietType: user.dietType,
      avoid: user.excludedFoodsAndAllergies
    });
    if (!recipes.length) throw new Error("No recipes matched your filters. Try reducing excluded foods.");
    while (recipes.length < needed) recipes = recipes.concat(recipes);
    recipes = recipes.slice(0, needed);
    const namesAr = ["السبت","الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة"];
    const namesEn = ["Saturday","Sunday","Monday","Tuesday","Wednesday","Thursday","Friday"];
    const isArabic = body.language === "ar";
    const days = Array.from({ length: daysCount }, (_, dayIndex) => {
      const meals = recipes.slice(dayIndex * mealsPerDay, (dayIndex + 1) * mealsPerDay);
      return { day: (isArabic ? namesAr : namesEn)[dayIndex], totalCalories: meals.reduce((s,m)=>s+m.calories,0), meals };
    });
    const data = { plan: {
      title: isArabic ? `خطة وجبات ${user.name || "المستخدم"} من وصفات حقيقية` : `${user.name || "Your"} real-recipe meal plan`,
      summary: isArabic ? "تم ترتيب الخطة من قاعدة بيانات وصفات خارجية حسب هدف السعرات وعدد الوجبات. القيم الغذائية تقديرية حسب بيانات الوصفة." : "This plan is arranged from an external recipe database using your calorie target and meal count. Nutrition values are recipe estimates.",
      medicalWarning: "",
      calc,
      days,
      tips: isArabic ? ["راجع حجم الحصة المكتوب في الوصفة.","يمكنك استبدال أي وجبة من قاعدة البيانات دون استخدام الذكاء الاصطناعي.","القيم تختلف باختلاف العلامات التجارية وطريقة الطهي."] : ["Check the serving size in each recipe.","Replace any meal from the recipe database without AI.","Values vary by brands and cooking method."],
      shoppingList: []
    }};
    cache.set(key, { time: Date.now(), data });
    return send(res, 200, data);
  } catch (error) {
    const message = error?.name === "AbortError" ? "The meals API took too long. Please try again." : (error?.message || "Meals API failed.");
    return send(res, 500, { error: message });
  }
}
