import { applyCommonHeaders, checkOrigin } from "./_shared.js";

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  applyCommonHeaders(res);

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (!checkOrigin(req)) {
    return res.status(403).json({ error: "Origin is not allowed." });
  }

  const code = String(req.query.code || "").replace(/\D/g, "").slice(0, 20);
  if (code.length < 6) {
    return res.status(400).json({ error: "A valid barcode is required." });
  }

  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,quantity,image_front_small_url,nutrition_grades,nutriments`,
      { headers: { "User-Agent": "HealthAi/1.0 (nutrition web app)" } }
    );

    const data = await response.json();
    if (!response.ok || data.status !== 1 || !data.product) {
      return res.status(404).json({ error: "Product not found." });
    }

    const p = data.product;
    const n = p.nutriments || {};

    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).json({
      product: {
        code,
        name: p.product_name || "",
        brand: p.brands || "",
        quantity: p.quantity || "",
        image: p.image_front_small_url || "",
        grade: p.nutrition_grades || "",
        calories: Number(n["energy-kcal_100g"] || 0),
        protein: Number(n.proteins_100g || 0),
        carbs: Number(n.carbohydrates_100g || 0),
        fat: Number(n.fat_100g || 0),
        sugar: Number(n.sugars_100g || 0),
        salt: Number(n.salt_100g || 0)
      }
    });
  } catch (error) {
    console.error("Product API error:", error);
    return res.status(502).json({ error: "Product lookup failed." });
  }
}
