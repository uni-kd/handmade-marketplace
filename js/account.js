// =====================================================================
// account.js - my account page (account.html)
// Shows the customer's orders and lets them edit their profile.
// =====================================================================

let profile = null;

async function loadOrders() {
  const box = document.getElementById("orders");

  // SELECT orders with their items, newest first.
  // There is no "WHERE customer_id = ..." here on purpose: the RLS
  // policy on orders already returns only this customer's rows.
  const { data: orders, error } = await supabaseClient
    .from("orders")
    .select("*, order_items(quantity, unit_price, product(name))")
    .order("order_date", { ascending: false });

  if (error) {
    console.error(error);
    box.innerHTML = '<p class="message error">Could not load your orders.</p>';
    return;
  }

  // Staff see every order through RLS, so keep only their own here.
  const mine = orders.filter((order) => order.customer_id === profile.id);

  if (mine.length === 0) {
    box.innerHTML = '<div class="empty"><p>You have no orders yet.</p><a class="btn" href="products.html">Go to shop</a></div>';
    return;
  }

  box.innerHTML = mine.map((order) => `
    <div class="review">
      <div class="head">
        <strong>Order #${order.id}</strong>
        <span><span class="badge status">${esc(order.status)}</span> <span class="muted small">${formatDate(order.order_date)}</span></span>
      </div>
      ${orderItemsTable(order)}
      <div class="summary-row total"><span>Total</span><span>${money(order.total)}</span></div>
    </div>`).join("");
}

async function saveProfile(event) {
  event.preventDefault();
  const message = document.getElementById("message");
  const fullName = document.getElementById("full-name").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const address = document.getElementById("address").value.trim();

  if (fullName.length < 2) return showMessage(message, "Please enter your full name.", "error");

  // UPDATE customers SET ... WHERE id = my id
  // The database only allows these three columns to be changed.
  const { error } = await supabaseClient
    .from("customers")
    .update({ full_name: fullName, phone: phone || null, address: address || null })
    .eq("id", profile.id);

  if (error) {
    console.error(error);
    return showMessage(message, "Could not save your profile.", "error");
  }
  showMessage(message, "Profile saved.", "success");
  renderHeader();   // the header shows the first name
}

document.addEventListener("DOMContentLoaded", async () => {
  const user = await requireLogin();
  if (!user) return;

  profile = await getProfile();
  if (!profile) {
    showMessage(document.getElementById("message"), "Could not load your profile.", "error");
    return;
  }

  document.getElementById("email").value = profile.email;
  document.getElementById("full-name").value = profile.full_name || "";
  document.getElementById("phone").value = profile.phone || "";
  document.getElementById("address").value = profile.address || "";

  document.getElementById("profile-form").addEventListener("submit", saveProfile);
  loadOrders();
});
