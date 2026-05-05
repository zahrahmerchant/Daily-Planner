const CATEGORY_KEYWORDS = {
  "Home Maintenance": ["tidy", "clean", "bedsheet", "bathroom", "room", "dust"],
  "Laundry & Clothes": ["laundry", "wash", "fold", "clothes", "iron", "wardrobe"],
  "Cooking & Kitchen": ["meal", "cook", "kitchen", "prep", "ingredients", "fridge"],
  "Personal Care": ["skincare", "shower", "hair", "nails", "self care"],
  "Errands & Admin": ["bill", "email", "message", "errand", "bank", "admin"],
  "Wedding Prep": ["vendor", "guest", "wedding", "venue", "dress", "invitation"],
};

export function parseQuickTask(input) {
  const name = input.trim();
  if (!name) return null;

  const estimateMatch = name.match(/\b(\d+)\s*(min|minutes|hour|hours)\b/i);
  let estimatedMinutes = 10;
  if (estimateMatch) {
    const amount = Number(estimateMatch[1]);
    estimatedMinutes = estimateMatch[2].toLowerCase().startsWith("hour") ? amount * 60 : amount;
  }

  return {
    name: name.replace(/\b\d+\s*(min|minutes|hour|hours)\b/i, "").trim() || name,
    estimatedMinutes,
    category: inferCategory(name),
  };
}

export function inferCategory(input) {
  const lower = input.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => lower.includes(keyword))) {
      return category;
    }
  }
  return "Home Maintenance";
}

export function describeQuickTask(parsed) {
  if (!parsed) return "";
  return `${parsed.name} - ${parsed.category} - about ${parsed.estimatedMinutes} min`;
}
