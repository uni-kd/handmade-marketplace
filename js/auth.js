// =====================================================================
// auth.js - register.html and login.html
// Uses Supabase Auth. Passwords are sent over HTTPS and stored hashed
// by Supabase. This website never stores a password itself.
// =====================================================================

// After login, go back to the page the visitor came from.
// Only simple page names from this site are accepted, so a link cannot
// be crafted to send the user to another website after logging in.
function nextPage() {
  const next = getParam("next");
  if (next && /^[a-z-]+\.html(\?[a-z0-9=&_-]*)?$/i.test(next)) {
    return next;
  }
  return "index.html";
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------------------------------------------------------------------
// REGISTER
// ---------------------------------------------------------------------
async function handleRegister(event) {
  event.preventDefault();
  const message = document.getElementById("message");
  const fullName = document.getElementById("full-name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirm-password").value;

  // Check the form before calling Supabase.
  if (fullName.length < 2) return showMessage(message, "Please enter your full name.", "error");
  if (!isValidEmail(email)) return showMessage(message, "Please enter a valid email address.", "error");
  if (password.length < 8) return showMessage(message, "Password must be at least 8 characters.", "error");
  if (password !== confirmPassword) return showMessage(message, "The two passwords do not match.", "error");

  // Creates the user in Supabase Auth. The full name is passed along so
  // the database trigger can create the matching row in customers.
  const { data, error } = await supabaseClient.auth.signUp({
    email: email,
    password: password,
    options: { data: { full_name: fullName } }
  });

  if (error) {
    console.error(error);
    return showMessage(message, error.message, "error");
  }

  if (data.session) {
    // Logged in straight away.
    window.location.href = nextPage();
  } else {
    // Email confirmation is switched on in Supabase.
    showMessage(message, "Account created. Check your email to confirm it, then log in.", "success");
  }
}

// ---------------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------------
async function handleLogin(event) {
  event.preventDefault();
  const message = document.getElementById("message");
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!isValidEmail(email) || password === "") {
    return showMessage(message, "Please enter your email and password.", "error");
  }

  const { error } = await supabaseClient.auth.signInWithPassword({
    email: email,
    password: password
  });

  if (error) {
    console.error(error);
    return showMessage(message, "Wrong email or password.", "error");
  }

  window.location.href = nextPage();
}

document.addEventListener("DOMContentLoaded", async () => {
  // Someone already logged in does not need these pages.
  if (await getUser()) {
    window.location.href = nextPage();
    return;
  }

  // Keep the ?next= part when switching between login and register.
  const next = getParam("next");
  if (next) {
    document.querySelectorAll('main a[href="login.html"], main a[href="register.html"]').forEach((link) => {
      link.href += "?next=" + encodeURIComponent(next);
    });
  }

  const registerForm = document.getElementById("register-form");
  if (registerForm) registerForm.addEventListener("submit", handleRegister);

  const loginForm = document.getElementById("login-form");
  if (loginForm) loginForm.addEventListener("submit", handleLogin);
});
