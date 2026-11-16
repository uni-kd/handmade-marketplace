// =====================================================================
// products.js - shop page (products.html)
// Search, category filter, price range, stock filter and sorting.
// Every search is a new query to Supabase. Nothing is hardcoded.
// =====================================================================

let categories = [];   // filled once from the category table

// Words that carry no meaning for the search.
const STOP_WORDS = ["a", "an", "the", "and", "or", "for", "with", "of", "in", "aed", "dhs", "handmade"];

// ---------------------------------------------------------------------
// SMART SEARCH
// Turns a sentence such as "rose candles under 60 in stock" into:
//   keywords: ["rose"]   category: Candles   max: 60   inStock: true
// ---------------------------------------------------------------------
function parseSmartQuery(text) {
  let query = text.toLowerCase();
  const result = { keywords: [], categoryId: null, min: null, max: null, inStock: false };
  let match;

  // "50 to 150" or "50-150"
  if ((match = query.match(/(\d+)\s*(?:to|-)\s*(\d+)/))) {
    result.min = Number(match[1]);
    result.max = Number(match[2]);
    query = query.replace(match[0], " ");
  }
  // "under 60", "below 60", "less than 60"
  if ((match = query.match(/(?:under|below|less than|max)\s*(\d+)/))) {
    result.max = Number(match[1]);
    query = query.replace(match[0], " ");
  }
  // "over 100", "above 100", "more than 100"
  if ((match = query.match(/(?:over|above|more than|min)\s*(\d+)/))) {
    result.min = Number(match[1]);
    query = query.replace(match[0], " ");
  }
  // "in stock" or "available"
  if ((match = query.match(/in stock|available/))) {
    result.inStock = true;
    query = query.replace(match[0], " ");
  }

  // Keep letters and numbers only, split into words, drop stop words.
  const words = query
    .replace(/[^a-z0-9؀-ۿ\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.includes(word));

  words.forEach((word) => {
    // "candles" -> "candle" so it also matches the singular form
    const stem = word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word;

    // If the word is a category name, use it as the category filter.
    // (Only for words of four letters or more, to avoid accidental matches.)
    const category = stem.length >= 4
      ? categories.find((c) => c.name.toLowerCase().includes(stem))
      : null;
    if (category && !result.categoryId) {
      result.categoryId = category.id;
    } else {
      result.keywords.push(stem);
    }
  });

  return result;
}

// Reads the form and returns one object with every active filter.
function readFilters() {
  const smart = parseSmartQuery(document.getElementById("search").value);
  const categoryValue = document.getElementById("category").value;
  const minValue = document.getElementById("min-price").value;
  const maxValue = document.getElementById("max-price").value;

  return {
    keywords: smart.keywords,
    // The form fields win over what was typed in the search box.
    categoryId: categoryValue ? Number(categoryValue) : smart.categoryId,
    min: minValue !== "" ? Number(minValue) : smart.min,
    max: maxValue !== "" ? Number(maxValue) : smart.max,
    inStock: document.getElementById("in-stock").checked || smart.inStock,
    sort: document.getElementById("sort").value
  };
}

// Shows the visitor how the search was understood.
function showChips(filters) {
  const chips = [];
  filters.keywords.forEach((word) => chips.push("Keyword: " + word));
  if (filters.categoryId) {
    const category = categories.find((c) => c.id === filters.categoryId);
    if (category) chips.push("Category: " + category.name);
  }
  if (filters.min !== null) chips.push("From AED " + filters.min);
  if (filters.max !== null) chips.push("Up to AED " + filters.max);
  if (filters.inStock) chips.push("In stock");

  document.getElementById("chips").innerHTML =
    chips.map((chip) => `<span class="chip">${esc(chip)}</span>`).join("");
}

// ---------------------------------------------------------------------
// Builds one Supabase query from the filters and shows the results.
// ---------------------------------------------------------------------
async function loadProducts() {
  const grid = document.getElementById("product-grid");
  const count = document.getElementById("result-count");
  const filters = readFilters();
  showChips(filters);

  // Start: SELECT product.*, category.name FROM product
  let query = supabaseClient.from("product").select("*, category(name)");

  // Every keyword must appear in the name, description or maker.
  // ilike = case-insensitive LIKE. Each .or() adds one more AND condition.
  filters.keywords.forEach((word) => {
    query = query.or(`name.ilike.%${word}%,description.ilike.%${word}%,maker.ilike.%${word}%`);
  });

  if (filters.categoryId)   query = query.eq("category_id", filters.categoryId);  // WHERE category_id = ...
  if (filters.min !== null) query = query.gte("price", filters.min);              // AND price >= min
  if (filters.max !== null) query = query.lte("price", filters.max);              // AND price <= max
  if (filters.inStock)      query = query.gt("stock", 0);                         // AND stock > 0

  // ORDER BY
  if (filters.sort === "price-asc")       query = query.order("price", { ascending: true });
  else if (filters.sort === "price-desc") query = query.order("price", { ascending: false });
  else if (filters.sort === "name")       query = query.order("name", { ascending: true });
  else query = query.order("created_at", { ascending: false }).order("id", { ascending: false });

  const { data: products, error } = await query;

  if (error) {
    console.error(error);
    count.textContent = "";
    grid.innerHTML = '<p class="message error">Could not load products. Please try again.</p>';
    return;
  }

  count.textContent = products.length + (products.length === 1 ? " product" : " products");

  if (products.length === 0) {
    grid.innerHTML = '<p class="empty">No products match your search. Try fewer words or a wider price range.</p>';
    return;
  }

  const ratings = await loadRatings();
  grid.innerHTML = products.map((p) => productCard(p, ratings[p.id])).join("");
  enableAddToCart(grid, products);
}

// Fills the category dropdown from the category table.
async function loadCategoryOptions() {
  const { data, error } = await supabaseClient.from("category").select("*").order("name");
  if (error) {
    console.error(error);
    return;
  }
  categories = data;

  const select = document.getElementById("category");
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    select.appendChild(option);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadCategoryOptions();

  // Links such as products.html?category=3 or ?q=candle pre-fill the form.
  if (getParam("category")) document.getElementById("category").value = getParam("category");
  if (getParam("q")) document.getElementById("search").value = getParam("q");

  document.getElementById("filter-form").addEventListener("submit", (event) => {
    event.preventDefault();
    loadProducts();
  });
  document.getElementById("category").addEventListener("change", loadProducts);
  document.getElementById("in-stock").addEventListener("change", loadProducts);
  document.getElementById("sort").addEventListener("change", loadProducts);
  document.getElementById("clear-filters").addEventListener("click", () => {
    document.getElementById("filter-form").reset();
    loadProducts();
  });

  loadProducts();
});
