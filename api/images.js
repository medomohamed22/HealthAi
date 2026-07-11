import {
  applyCommonHeaders,
  checkOrigin
} from "./_shared.js";

export const config = {
  maxDuration: 20
};

function tokens(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w\u0600-\u06ff\s-]/g, " ")
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 2 &&
        !["food", "meal", "plate", "healthy", "dish", "with", "and"].includes(word)
    );
}

function mealDbScore(item, query, mealName) {
  const target = new Set(tokens(`${query} ${mealName || ""}`));
  const source = new Set(
    tokens(`${item.strMeal || ""} ${item.strCategory || ""} ${item.strTags || ""}`)
  );

  let hits = 0;
  target.forEach((word) => {
    if (source.has(word)) hits += 1;
  });

  return target.size ? hits / target.size : 0;
}

async function searchUnsplash(query, mealName) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) return null;

  const params = new URLSearchParams({
    query,
    orientation: "landscape",
    content_filter: "high",
    per_page: "8"
  });

  const response = await fetch(
    `https://api.unsplash.com/search/photos?${params.toString()}`,
    {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        "Accept-Version": "v1"
      }
    }
  );

  if (!response.ok) return null;

  const data = await response.json();
  const photo = (data.results || []).find((item) => item?.urls?.regular);
  if (!photo) return null;

  return {
    imageUrl: photo.urls.regular,
    pageUrl: `${photo.links.html}?utm_source=HealthAi&utm_medium=referral`,
    title: photo.alt_description || photo.description || mealName || "Food",
    source: `Unsplash · ${photo.user?.name || "Photographer"}`
  };
}

async function searchMealDb(query, mealName) {
  const compactQuery = query
    .replace(/\b(plate|bowl|healthy|meal|food|breakfast|lunch|dinner)\b/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(" ");

  if (!compactQuery) return null;

  const response = await fetch(
    `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(compactQuery)}`
  );

  if (!response.ok) return null;

  const data = await response.json();
  const meals = Array.isArray(data?.meals) ? data.meals : [];

  const ranked = meals
    .map((item) => ({
      item,
      score: mealDbScore(item, query, mealName)
    }))
    .sort((a, b) => b.score - a.score);

  if (!ranked[0] || ranked[0].score < 0.34) return null;

  const meal = ranked[0].item;
  return {
    imageUrl: meal.strMealThumb,
    pageUrl:
      meal.strSource ||
      meal.strYoutube ||
      "https://www.themealdb.com/",
    title: meal.strMeal || mealName || "Meal",
    source: "TheMealDB"
  };
}

export default async function handler(req, res) {
  applyCommonHeaders(res);

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (!checkOrigin(req)) {
    return res.status(403).json({ error: "Origin is not allowed." });
  }

  const query = String(req.query.query || "").trim().slice(0, 180);
  const mealName = String(req.query.mealName || "").trim().slice(0, 180);

  if (!query) {
    return res.status(400).json({ error: "A search query is required." });
  }

  try {
    const image =
      (await searchUnsplash(query, mealName)) ||
      (await searchMealDb(query, mealName)) ||
      null;

    // Cache successful searches at Vercel's edge for one day.
    if (image) {
      res.setHeader(
        "Cache-Control",
        "s-maxage=86400, stale-while-revalidate=604800"
      );
    }

    return res.status(200).json({ image });
  } catch (error) {
    console.error("Image search error:", error);
    return res.status(200).json({ image: null });
  }
}
