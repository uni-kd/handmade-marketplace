// =====================================================================
// home.js - home page (index.html)
// Loads the categories and the six newest products from Supabase.
// =====================================================================

// Which illustration to show for each category.
const CATEGORY_IMAGES = {
  "Handmade Jewelry": "images/jewelry.svg",
  "Decorations": "images/decor.svg",
  "Candles": "images/candles.svg",
  "Accessories": "images/accessories.svg",
  "Gifts": "images/gifts.svg"
};

async function loadCategories() {
  const grid = document.getElementById("category-grid");

  // SELECT * FROM category ORDER BY id
  const { data: categories, error } = await supabaseClient
    .from("category")
    .select("*")
    .order("id");

  if (error) {
    console.error(error);
    grid.innerHTML = '<p class="message error">Could not load categories.</p>';
    return;
  }

  grid.innerHTML = categories.map((category) => `
    <a class="category-tile" href="products.html?category=${category.id}">
      <img src="${esc(CATEGORY_IMAGES[category.name] || "images/gifts.svg")}" alt="">
      <strong>${esc(category.name)}</strong>
    </a>`).join("");
}

async function loadFeatured() {
  const grid = document.getElementById("featured-grid");

  // SELECT product.*, category.name ... ORDER BY created_at DESC LIMIT 6
  const { data: products, error } = await supabaseClient
    .from("product")
    .select("*, category(name)")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(6);

  if (error) {
    console.error(error);
    grid.innerHTML = '<p class="message error">Could not load products.</p>';
    return;
  }

  const ratings = await loadRatings();
  grid.innerHTML = products.map((p) => productCard(p, ratings[p.id])).join("");
  enableAddToCart(grid, products);
}

document.addEventListener("DOMContentLoaded", () => {
  loadCategories();
  loadFeatured();
});
