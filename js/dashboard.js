// =====================================================================
// dashboard.js - analytics dashboard for store staff (dashboard.html)
//
// Only users with is_admin = true in the customers table can use it.
// Hiding the page in JavaScript is not the real protection: the RLS
// policies in the database refuse these queries for normal customers.
//
// Shows: total sales, orders, products, average order value, most
// popular products, sales by category, low stock and recent orders.
// Staff can also add, edit and delete products (INSERT, UPDATE, DELETE).
// =====================================================================

const LOW_STOCK_LIMIT = 5;
const STATUSES = ["pending", "shipped", "delivered", "cancelled"];
const CATEGORY_IMAGES = {
  "Handmade Jewelry": "images/jewelry.svg",
  "Decorations": "images/decor.svg",
  "Candles": "images/candles.svg",
  "Accessories": "images/accessories.svg",
  "Gifts": "images/gifts.svg"
};

let categories = [];

// Draws a simple horizontal bar chart with HTML and CSS.
// rows = [{ label: "Candles", value: 320 }, ...]
function barChart(container, rows, formatValue, colourClass = "") {
  if (rows.length === 0) {
    container.innerHTML = '<p class="muted">No sales yet. Place a test order to see data here.</p>';
    return;
  }
  const highest = Math.max(...rows.map((row) => row.value));
  container.innerHTML = rows.map((row) => `
    <div class="bar-row">
      <span>${esc(row.label)}</span>
      <div class="bar-track"><div class="bar-fill ${colourClass}" style="width:${(row.value / highest) * 100}%"></div></div>
      <span class="num">${esc(formatValue(row.value))}</span>
    </div>`).join("");
}

// ---------------------------------------------------------------------
// 1. Numbers at the top and the recent orders table
// ---------------------------------------------------------------------
async function loadOrderStats() {
  // SELECT orders with the customer's name, newest first.
  const { data: orders, error } = await supabaseClient
    .from("orders")
    .select("id, order_date, status, total, customers(full_name)")
    .order("order_date", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  // Cancelled orders do not count as sales.
  const valid = orders.filter((order) => order.status !== "cancelled");
  const totalSales = valid.reduce((sum, order) => sum + Number(order.total), 0);

  document.getElementById("stat-sales").textContent = money(totalSales);
  document.getElementById("stat-orders").textContent = orders.length;
  document.getElementById("stat-average").textContent =
    valid.length > 0 ? money(totalSales / valid.length) : money(0);

  const box = document.getElementById("recent-orders");
  if (orders.length === 0) {
    box.innerHTML = '<p class="muted">No orders yet.</p>';
    return;
  }

  box.innerHTML = `
    <table>
      <thead><tr><th>#</th><th>Customer</th><th>Date</th><th>Total</th><th>Status</th></tr></thead>
      <tbody>
        ${orders.slice(0, 8).map((order) => `
          <tr>
            <td>${order.id}</td>
            <td>${esc(order.customers ? order.customers.full_name : "")}</td>
            <td>${formatDate(order.order_date)}</td>
            <td>${money(order.total)}</td>
            <td>
              <select class="order-status" data-id="${order.id}" aria-label="Status of order ${order.id}">
                ${STATUSES.map((s) => `<option value="${s}" ${s === order.status ? "selected" : ""}>${s}</option>`).join("")}
              </select>
            </td>
          </tr>`).join("")}
      </tbody>
    </table>`;

  // UPDATE orders SET status = ... WHERE id = ...
  box.querySelectorAll(".order-status").forEach((select) => {
    select.addEventListener("change", async () => {
      const { error } = await supabaseClient
        .from("orders")
        .update({ status: select.value })
        .eq("id", Number(select.dataset.id));

      const message = document.getElementById("message");
      if (error) {
        console.error(error);
        showMessage(message, "Could not update the order.", "error");
      } else {
        showMessage(message, "Order #" + select.dataset.id + " is now " + select.value + ".", "success");
        loadOrderStats();
        loadSalesCharts();
      }
    });
  });
}

// ---------------------------------------------------------------------
// 2. Charts: most popular products and sales by category
//    Both read the product_sales view (see database.sql, section 4).
// ---------------------------------------------------------------------
async function loadSalesCharts() {
  const { data: sales, error } = await supabaseClient
    .from("product_sales")
    .select("*")
    .order("units_sold", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  // Top five products by units sold.
  const top = sales.slice(0, 5).map((row) => ({
    label: row.product_name,
    value: Number(row.units_sold)
  }));
  barChart(document.getElementById("chart-top"), top, (v) => v + " sold");

  // Add up the revenue of each category.
  const totals = {};
  sales.forEach((row) => {
    totals[row.category_name] = (totals[row.category_name] || 0) + Number(row.revenue);
  });
  const byCategory = Object.keys(totals)
    .map((name) => ({ label: name, value: totals[name] }))
    .sort((a, b) => b.value - a.value);
  barChart(document.getElementById("chart-category"), byCategory, (v) => v.toFixed(0), "olive");
}

// ---------------------------------------------------------------------
// 3. Products: count, low stock list and the manage table
// ---------------------------------------------------------------------
async function loadProducts() {
  const { data: products, error } = await supabaseClient
    .from("product")
    .select("*, category(name)")
    .order("id");

  if (error) {
    console.error(error);
    return;
  }

  document.getElementById("stat-products").textContent = products.length;

  // Low stock
  const low = products
    .filter((product) => product.stock <= LOW_STOCK_LIMIT)
    .sort((a, b) => a.stock - b.stock);

  document.getElementById("low-stock").innerHTML = low.length === 0
    ? '<p class="muted">All products are well stocked.</p>'
    : `<table>
        <thead><tr><th>Product</th><th>Stock</th></tr></thead>
        <tbody>
          ${low.map((p) => `<tr><td>${esc(p.name)}</td><td>${stockBadge(p.stock)}</td></tr>`).join("")}
        </tbody>
      </table>`;

  // Manage table
  const box = document.getElementById("product-table");
  box.innerHTML = `
    <table>
      <thead><tr><th>#</th><th>Product</th><th>Category</th><th>Price (AED)</th><th>Stock</th><th></th></tr></thead>
      <tbody>
        ${products.map((p) => `
          <tr data-id="${p.id}">
            <td>${p.id}</td>
            <td>${esc(p.name)}</td>
            <td>${esc(p.category.name)}</td>
            <td><input type="number" class="edit-price" value="${Number(p.price)}" min="0" step="0.01" aria-label="Price of ${esc(p.name)}"></td>
            <td><input type="number" class="edit-stock" value="${p.stock}" min="0" step="1" aria-label="Stock of ${esc(p.name)}"></td>
            <td style="white-space:nowrap">
              <button class="btn btn-small save-product">Save</button>
              <button class="btn btn-danger btn-small delete-product">Delete</button>
            </td>
          </tr>`).join("")}
      </tbody>
    </table>`;

  const message = document.getElementById("message");

  // UPDATE product SET price = ..., stock = ... WHERE id = ...
  box.querySelectorAll(".save-product").forEach((button) => {
    button.addEventListener("click", async () => {
      const row = button.closest("tr");
      const price = Number(row.querySelector(".edit-price").value);
      const stock = Number(row.querySelector(".edit-stock").value);

      if (!(price >= 0) || !Number.isInteger(stock) || stock < 0) {
        return showMessage(message, "Price and stock must be zero or more. Stock must be a whole number.", "error");
      }

      const { error } = await supabaseClient
        .from("product")
        .update({ price: price, stock: stock })
        .eq("id", Number(row.dataset.id));

      if (error) {
        console.error(error);
        showMessage(message, "Could not save the product.", "error");
      } else {
        showMessage(message, "Product #" + row.dataset.id + " saved.", "success");
        loadProducts();
      }
    });
  });

  // DELETE FROM product WHERE id = ...
  box.querySelectorAll(".delete-product").forEach((button) => {
    button.addEventListener("click", async () => {
      const row = button.closest("tr");
      if (!confirm("Delete product #" + row.dataset.id + "?")) return;

      const { error } = await supabaseClient
        .from("product")
        .delete()
        .eq("id", Number(row.dataset.id));

      if (error) {
        console.error(error);
        // 23503 = the product is used in an order (foreign key)
        const text = error.code === "23503"
          ? "This product is part of an existing order and cannot be deleted. Set its stock to 0 instead."
          : "Could not delete the product.";
        showMessage(message, text, "error");
      } else {
        showMessage(message, "Product deleted.", "success");
        loadProducts();
      }
    });
  });
}

// ---------------------------------------------------------------------
// 4. Add a product (INSERT)
// ---------------------------------------------------------------------
async function addProduct(event) {
  event.preventDefault();
  const message = document.getElementById("message");
  const name = document.getElementById("p-name").value.trim();
  const categoryId = Number(document.getElementById("p-category").value);
  const maker = document.getElementById("p-maker").value.trim();
  const price = Number(document.getElementById("p-price").value);
  const stock = Number(document.getElementById("p-stock").value);
  const description = document.getElementById("p-description").value.trim();

  if (name.length < 3 || maker.length < 2 || description.length < 10) {
    return showMessage(message, "Please fill in the name, maker and a description of at least 10 characters.", "error");
  }
  if (!(price > 0) || !Number.isInteger(stock) || stock < 0) {
    return showMessage(message, "Enter a price above 0 and a whole number for stock.", "error");
  }

  const category = categories.find((c) => c.id === categoryId);

  // INSERT INTO product (...)
  const { error } = await supabaseClient.from("product").insert({
    name: name,
    category_id: categoryId,
    maker: maker,
    price: price,
    stock: stock,
    description: description,
    image_url: CATEGORY_IMAGES[category.name] || "images/gifts.svg"
  });

  if (error) {
    console.error(error);
    return showMessage(message, "Could not add the product.", "error");
  }

  showMessage(message, name + " was added to the shop.", "success");
  event.target.reset();
  loadProducts();
}

document.addEventListener("DOMContentLoaded", async () => {
  const user = await requireLogin();
  if (!user) return;

  const profile = await getProfile();
  if (!profile || !profile.is_admin) {
    showMessage(document.getElementById("message"), "This page is for store staff only.", "error");
    return;
  }

  document.getElementById("dashboard").classList.remove("hidden");

  const { data } = await supabaseClient.from("category").select("*").order("name");
  categories = data || [];
  document.getElementById("p-category").innerHTML = categories
    .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");

  document.getElementById("product-form").addEventListener("submit", addProduct);

  loadOrderStats();
  loadSalesCharts();
  loadProducts();
});
