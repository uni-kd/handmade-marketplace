// =====================================================================
// app.js - shared code loaded on every page.
//   1. Supabase connection
//   2. Small helpers (escape text, format money, read URL parameters)
//   3. Login helpers
//   4. Shopping cart stored in localStorage
//   5. Header, footer and product cards
// =====================================================================

// 1. SUPABASE CONNECTION ---------------------------------------------
// The publishable key is safe to show in public code. What a visitor
// can actually read or change is decided by the RLS policies in
// database/database.sql, not by hiding this key.
const SUPABASE_URL = "https://sxwahzykauoikcirnzlz.supabase.co";
const SUPABASE_KEY = "sb_publishable_HXrpimwfeny-zjKxfFk-ow_vdCH0eGg";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 2. HELPERS ---------------------------------------------------------

// Makes text from the database safe to place inside HTML.
// Without this, a review containing <script> could run in other
// visitors' browsers (cross-site scripting).
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(amount) {
  return "AED " + Number(amount).toFixed(2);
}

// Reads a value from the page address, e.g. product-detail.html?id=4
function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// Shows a coloured message box. type is "error", "success" or "info".
function showMessage(element, text, type = "info") {
  element.className = "message " + type;
  element.textContent = text;
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric"
  });
}

// Turns a rating such as 4.3 into ★★★★☆
function stars(rating) {
  const full = Math.round(Number(rating) || 0);
  return "★".repeat(full) + "☆".repeat(5 - full);
}

// 3. LOGIN HELPERS ---------------------------------------------------

// Returns the logged-in user, or null for a visitor.
async function getUser() {
  const { data } = await supabaseClient.auth.getSession();
  return data.session ? data.session.user : null;
}

// Returns the user's row from the customers table (SELECT).
async function getProfile() {
  const user = await getUser();
  if (!user) return null;
  const { data, error } = await supabaseClient
    .from("customers")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (error) console.error(error);
  return data;
}

// Used by pages that need a login (checkout, account, dashboard).
// Sends visitors to the login page and brings them back afterwards.
async function requireLogin() {
  const user = await getUser();
  if (!user) {
    const page = window.location.pathname.split("/").pop() || "index.html";
    window.location.href = "login.html?next=" + encodeURIComponent(page + window.location.search);
    return null;
  }
  return user;
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
}

// 4. SHOPPING CART (localStorage) ------------------------------------
// The cart is saved in the browser as a list like:
//   [{ id: 3, name: "Beaded Bracelet", price: 45, image_url: "...", quantity: 2 }]
// It only holds what the customer wants. The real price and stock are
// checked again by the database at checkout.
const CART_KEY = "yadawi_cart";

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartCount();
}

function addToCart(product, quantity = 1) {
  const cart = getCart();
  const existing = cart.find((item) => item.id === product.id);
  const alreadyInCart = existing ? existing.quantity : 0;

  if (alreadyInCart + quantity > product.stock) {
    alert("Sorry, only " + product.stock + " of this item left in stock.");
    return false;
  }

  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      image_url: product.image_url,
      quantity: quantity
    });
  }
  saveCart(cart);
  return true;
}

function cartCount() {
  return getCart().reduce((sum, item) => sum + item.quantity, 0);
}

function cartTotal() {
  return getCart().reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function updateCartCount() {
  const badge = document.getElementById("cart-count");
  if (badge) badge.textContent = cartCount();
}

// 5. HEADER, FOOTER AND PRODUCT CARDS --------------------------------

async function renderHeader() {
  const header = document.getElementById("site-header");
  if (!header) return;

  const profile = await getProfile();
  const page = window.location.pathname.split("/").pop() || "index.html";
  const active = (name) => (page === name ? ' class="active"' : "");

  let accountLinks = `
    <a href="login.html"${active("login.html")}>Login</a>
    <a href="register.html" class="btn btn-small">Register</a>`;

  if (profile) {
    accountLinks = `
      ${profile.is_admin ? `<a href="dashboard.html"${active("dashboard.html")}>Dashboard</a>` : ""}
      <a href="account.html"${active("account.html")}>Hi, ${esc(profile.full_name.split(" ")[0])}</a>
      <a href="#" id="logout-link">Logout</a>`;
  }

  header.className = "site-header";
  header.innerHTML = `
    <div class="container nav">
      <a class="logo" href="index.html">Yadawi<span>يدوي</span></a>
      <button class="nav-toggle" id="nav-toggle" aria-label="Open menu">☰</button>
      <nav class="nav-links" id="nav-links">
        <a href="index.html"${active("index.html")}>Home</a>
        <a href="products.html"${active("products.html")}>Shop</a>
        <a href="about.html"${active("about.html")}>About</a>
        <a href="cart.html"${active("cart.html")}>Cart<span class="cart-count" id="cart-count">0</span></a>
        ${accountLinks}
      </nav>
    </div>`;

  updateCartCount();

  document.getElementById("nav-toggle").addEventListener("click", () => {
    document.getElementById("nav-links").classList.toggle("open");
  });

  const logoutLink = document.getElementById("logout-link");
  if (logoutLink) {
    logoutLink.addEventListener("click", (event) => {
      event.preventDefault();
      logout();
    });
  }
}

function renderFooter() {
  const footer = document.getElementById("site-footer");
  if (!footer) return;
  footer.className = "site-footer";
  footer.innerHTML = `
    <div class="container">
      <div>Yadawi · Handmade in the UAE · Prices include 5% VAT</div>
      <div>INT424 student project. No real payments or deliveries. <a href="about.html">About</a></div>
    </div>`;
}

// Returns the stock label shown on cards and on the product page.
function stockBadge(stock) {
  if (stock <= 0) return '<span class="badge out">Out of stock</span>';
  if (stock <= 5) return `<span class="badge low">Only ${stock} left</span>`;
  return '<span class="badge in">In stock</span>';
}

// Builds the HTML for one product card.
// rating is a row from the product_rating view (or undefined).
function productCard(product, rating) {
  const ratingHtml = rating
    ? `<span class="stars" title="${esc(rating.avg_rating)} out of 5">${stars(rating.avg_rating)}</span>
       <span class="muted small">(${esc(rating.review_count)})</span>`
    : '<span class="muted small">No reviews yet</span>';

  return `
    <article class="product-card">
      <a href="product-detail.html?id=${product.id}">
        <img src="${esc(product.image_url)}" alt="${esc(product.name)}" loading="lazy">
      </a>
      <div class="body">
        <span class="muted small">${esc(product.category ? product.category.name : "")}</span>
        <h3><a href="product-detail.html?id=${product.id}">${esc(product.name)}</a></h3>
        <div>${ratingHtml}</div>
        <div class="row">
          <span class="price">${money(product.price)}</span>
          ${stockBadge(product.stock)}
        </div>
        <button class="btn btn-block add-to-cart" data-id="${product.id}" ${product.stock <= 0 ? "disabled" : ""}>
          ${product.stock <= 0 ? "Sold out" : "Add to cart"}
        </button>
      </div>
    </article>`;
}

// Makes the "Add to cart" buttons inside a container work.
// products is the list that was used to build the cards.
function enableAddToCart(container, products) {
  container.querySelectorAll(".add-to-cart").forEach((button) => {
    button.addEventListener("click", () => {
      const product = products.find((p) => p.id === Number(button.dataset.id));
      if (product && addToCart(product, 1)) {
        button.textContent = "Added ✓";
        setTimeout(() => (button.textContent = "Add to cart"), 1200);
      }
    });
  });
}

// Loads the average rating of every product into a lookup object:
//   { 3: { avg_rating: 4.5, review_count: 2 }, ... }
async function loadRatings() {
  const { data, error } = await supabaseClient.from("product_rating").select("*");
  if (error) console.error(error);
  const lookup = {};
  (data || []).forEach((row) => (lookup[row.product_id] = row));
  return lookup;
}

document.addEventListener("DOMContentLoaded", () => {
  renderHeader();
  renderFooter();
});
