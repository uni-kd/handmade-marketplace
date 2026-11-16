// =====================================================================
// checkout.js - checkout page (checkout.html)
// Saves the order in two tables:
//   orders       one row for the whole order
//   order_items  one row for each product in the order
// The customer must be logged in.
// =====================================================================

let profile = null;

function renderOrderSummary() {
  const cart = getCart();
  document.getElementById("order-lines").innerHTML = cart.map((item) => `
    <div class="summary-row">
      <span>${esc(item.name)} × ${item.quantity}</span>
      <span>${money(item.price * item.quantity)}</span>
    </div>`).join("");
  document.getElementById("order-total").textContent = money(cartTotal());
}

// UAE mobile numbers: 05XXXXXXXX or +9715XXXXXXXX
function isValidUaeMobile(phone) {
  return /^(\+971|0)5\d{8}$/.test(phone.replace(/[\s-]/g, ""));
}

async function placeOrder(event) {
  event.preventDefault();
  const message = document.getElementById("message");
  const button = document.getElementById("place-order");
  const fullName = document.getElementById("full-name").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const address = document.getElementById("address").value.trim();
  const cart = getCart();

  // 1. Check the form.
  if (cart.length === 0) return showMessage(message, "Your cart is empty.", "error");
  if (fullName.length < 2) return showMessage(message, "Please enter your full name.", "error");
  if (!isValidUaeMobile(phone)) return showMessage(message, "Please enter a valid UAE mobile number, e.g. 0501234567.", "error");
  if (address.length < 10) return showMessage(message, "Please enter your full delivery address.", "error");

  // Stop a second click from creating a second order.
  button.disabled = true;
  button.textContent = "Placing order...";

  // 2. UPDATE customers: remember the details for next time.
  const { error: profileError } = await supabaseClient
    .from("customers")
    .update({ full_name: fullName, phone: phone, address: address })
    .eq("id", profile.id);
  if (profileError) console.error(profileError);

  // 3. INSERT INTO orders. We only send the address and phone.
  //    The database fills in the customer id, date, status and total.
  const { data: order, error: orderError } = await supabaseClient
    .from("orders")
    .insert({ shipping_address: address, phone: phone })
    .select()
    .single();

  if (orderError) {
    console.error(orderError);
    button.disabled = false;
    button.textContent = "Place order";
    return showMessage(message, "Could not create your order. Please try again.", "error");
  }

  // 4. INSERT INTO order_items, one row per product.
  //    We do not send a price. A database trigger copies the real
  //    price, checks the stock, reduces it and adds up the order total.
  const items = cart.map((item) => ({
    order_id: order.id,
    product_id: item.id,
    quantity: item.quantity
  }));

  const { error: itemsError } = await supabaseClient.from("order_items").insert(items);

  if (itemsError) {
    console.error(itemsError);
    // The items were not saved, so remove the empty order again (DELETE).
    await supabaseClient.from("orders").delete().eq("id", order.id);

    button.disabled = false;
    button.textContent = "Place order";
    const text = itemsError.message.startsWith("Not enough stock")
      ? itemsError.message + ". Please update your cart."
      : "Could not save your order. Please try again.";
    return showMessage(message, text, "error");
  }

  // 5. Done: empty the cart and show the confirmation page.
  saveCart([]);
  window.location.href = "confirmation.html?order=" + order.id;
}

document.addEventListener("DOMContentLoaded", async () => {
  const user = await requireLogin();
  if (!user) return;

  if (getCart().length === 0) {
    window.location.href = "cart.html";
    return;
  }

  // Pre-fill the form from the customers table.
  profile = await getProfile();
  if (profile) {
    document.getElementById("full-name").value = profile.full_name || "";
    document.getElementById("phone").value = profile.phone || "";
    document.getElementById("address").value = profile.address || "";
  }

  renderOrderSummary();
  document.getElementById("checkout-form").addEventListener("submit", placeOrder);
});
