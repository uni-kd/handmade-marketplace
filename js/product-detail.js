// =====================================================================
// product-detail.js - one product and its reviews (product-detail.html)
// Reviews show all four database operations on the reviews table:
//   SELECT (list), INSERT (post), UPDATE (edit), DELETE (remove)
// =====================================================================

const productId = Number(getParam("id"));
let currentUser = null;
let editingReviewId = null;   // set while the customer edits their review

async function loadProduct() {
  const box = document.getElementById("product");

  if (!productId) {
    box.innerHTML = '<p class="message error">Product not found.</p>';
    return;
  }

  // SELECT product.*, category.name FROM product WHERE id = productId
  const { data: product, error } = await supabaseClient
    .from("product")
    .select("*, category(name)")
    .eq("id", productId)
    .maybeSingle();

  if (error || !product) {
    if (error) console.error(error);
    box.innerHTML = '<p class="message error">Product not found.</p>';
    return;
  }

  document.title = product.name + " | Yadawi";

  box.innerHTML = `
    <img src="${esc(product.image_url)}" alt="${esc(product.name)}">
    <div>
      <span class="muted small">${esc(product.category.name)}</span>
      <h1>${esc(product.name)}</h1>
      <p class="muted">Made by ${esc(product.maker)}</p>
      <div id="rating-summary"></div>
      <div class="price">${money(product.price)}</div>
      <p class="muted small">Price includes 5% VAT</p>
      <p>${stockBadge(product.stock)} <span class="muted small">${product.stock} available</span></p>
      <p>${esc(product.description)}</p>
      <div class="qty-row">
        <label for="quantity" style="margin:0">Quantity</label>
        <input type="number" id="quantity" value="1" min="1" max="${product.stock}" ${product.stock <= 0 ? "disabled" : ""}>
        <button class="btn" id="add-button" ${product.stock <= 0 ? "disabled" : ""}>
          ${product.stock <= 0 ? "Sold out" : "Add to cart"}
        </button>
      </div>
      <div id="cart-message"></div>
    </div>`;

  document.getElementById("add-button").addEventListener("click", () => {
    const quantity = Number(document.getElementById("quantity").value);
    const message = document.getElementById("cart-message");

    if (!Number.isInteger(quantity) || quantity < 1) {
      showMessage(message, "Please enter a valid quantity.", "error");
      return;
    }
    if (addToCart(product, quantity)) {
      message.className = "message success";
      message.innerHTML = 'Added to cart. <a href="cart.html">View cart</a>';
    }
  });
}

// ---------------------------------------------------------------------
// REVIEWS
// ---------------------------------------------------------------------
async function loadReviews() {
  const list = document.getElementById("reviews");

  // SELECT * FROM reviews WHERE product_id = productId ORDER BY created_at DESC
  const { data: reviews, error } = await supabaseClient
    .from("reviews")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    list.innerHTML = '<p class="message error">Could not load reviews.</p>';
    return;
  }

  // Average rating shown next to the product name.
  const summary = document.getElementById("rating-summary");
  if (summary) {
    if (reviews.length > 0) {
      const average = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
      summary.innerHTML = `<span class="stars">${stars(average)}</span>
        <span class="muted small">${average.toFixed(1)} out of 5 (${reviews.length} review${reviews.length === 1 ? "" : "s"})</span>`;
    } else {
      summary.innerHTML = '<span class="muted small">No reviews yet</span>';
    }
  }

  // A customer can review a product once. If they already did,
  // hide the form until they press Edit.
  const myReview = currentUser ? reviews.find((r) => r.customer_id === currentUser.id) : null;
  const form = document.getElementById("review-form");
  if (currentUser && !editingReviewId) {
    form.classList.toggle("hidden", Boolean(myReview));
  }

  if (reviews.length === 0) {
    list.innerHTML = '<p class="muted">Be the first to review this product.</p>';
    return;
  }

  list.innerHTML = reviews.map((review) => {
    const isMine = currentUser && review.customer_id === currentUser.id;
    return `
      <div class="review">
        <div class="head">
          <strong>${esc(review.reviewer_name)}${isMine ? " (you)" : ""}</strong>
          <span class="muted small">${formatDate(review.created_at)}</span>
        </div>
        <div class="stars">${stars(review.rating)}</div>
        <p style="margin:4px 0 0">${esc(review.comment)}</p>
        ${isMine ? `
          <div class="review-actions">
            <button class="btn btn-outline btn-small edit-review" data-id="${review.id}">Edit</button>
            <button class="btn btn-danger btn-small delete-review" data-id="${review.id}">Delete</button>
          </div>` : ""}
      </div>`;
  }).join("");

  // Edit: put the review back into the form.
  list.querySelectorAll(".edit-review").forEach((button) => {
    button.addEventListener("click", () => {
      const review = reviews.find((r) => r.id === Number(button.dataset.id));
      editingReviewId = review.id;
      document.getElementById("rating").value = review.rating;
      document.getElementById("comment").value = review.comment;
      document.getElementById("review-form-title").textContent = "Edit your review";
      document.getElementById("review-submit").textContent = "Save changes";
      document.getElementById("review-cancel").classList.remove("hidden");
      form.classList.remove("hidden");
      form.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  // DELETE FROM reviews WHERE id = ...
  // RLS only lets a customer delete their own review.
  list.querySelectorAll(".delete-review").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Delete your review?")) return;

      const { error } = await supabaseClient
        .from("reviews")
        .delete()
        .eq("id", Number(button.dataset.id));

      const message = document.getElementById("review-message");
      if (error) {
        console.error(error);
        showMessage(message, "Could not delete the review.", "error");
      } else {
        showMessage(message, "Review deleted.", "success");
        resetReviewForm();
        loadReviews();
      }
    });
  });
}

function resetReviewForm() {
  editingReviewId = null;
  document.getElementById("review-form").reset();
  document.getElementById("review-form-title").textContent = "Write a review";
  document.getElementById("review-submit").textContent = "Post review";
  document.getElementById("review-cancel").classList.add("hidden");
}

async function submitReview(event) {
  event.preventDefault();
  const message = document.getElementById("review-message");
  const rating = Number(document.getElementById("rating").value);
  const comment = document.getElementById("comment").value.trim();

  // Check the input before sending it to the database.
  if (rating < 1 || rating > 5) {
    showMessage(message, "Please choose a rating from 1 to 5.", "error");
    return;
  }
  if (comment.length < 5) {
    showMessage(message, "Please write at least a few words.", "error");
    return;
  }

  let error;
  if (editingReviewId) {
    // UPDATE reviews SET rating = ..., comment = ... WHERE id = ...
    ({ error } = await supabaseClient
      .from("reviews")
      .update({ rating: rating, comment: comment })
      .eq("id", editingReviewId));
  } else {
    // INSERT INTO reviews (product_id, rating, comment)
    // The database adds the customer id and name itself (trigger).
    ({ error } = await supabaseClient
      .from("reviews")
      .insert({ product_id: productId, rating: rating, comment: comment }));
  }

  if (error) {
    console.error(error);
    // 23505 = unique rule broken: this customer already reviewed the product
    const text = error.code === "23505"
      ? "You have already reviewed this product. Edit your review instead."
      : "Could not save your review. Please try again.";
    showMessage(message, text, "error");
    return;
  }

  showMessage(message, editingReviewId ? "Review updated." : "Thank you for your review.", "success");
  resetReviewForm();
  loadReviews();
}

document.addEventListener("DOMContentLoaded", async () => {
  currentUser = await getUser();

  // Only logged-in customers see the review form.
  if (currentUser) {
    document.getElementById("review-form").classList.remove("hidden");
  } else {
    const loginNote = document.getElementById("review-login");
    loginNote.classList.remove("hidden");
    loginNote.querySelector("a").href =
      "login.html?next=" + encodeURIComponent("product-detail.html?id=" + productId);
  }

  document.getElementById("review-form").addEventListener("submit", submitReview);
  document.getElementById("review-cancel").addEventListener("click", () => {
    resetReviewForm();
    loadReviews();
  });

  await loadProduct();
  if (productId) loadReviews();
});
