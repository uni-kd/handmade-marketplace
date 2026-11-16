# Yadawi - Handmade Products Marketplace

INT424 E-Commerce final project (Project 3: Handmade Products Marketplace), Ajman University.

Yadawi (يدوي, "handmade" in Arabic) is an online marketplace where customers in the UAE buy handmade jewelry, decorations, candles, accessories and gifts from local artisans.

- **Live website:** https://uni-kd.github.io/handmade-marketplace/
- **Repository:** https://github.com/uni-kd/handmade-marketplace

## Team

| Name | Student ID |
| --- | --- |
| Abdallah Kaddoura | 202310381 |
| _to be added_ | |

## Main features

- Products, categories and stock loaded from Supabase (nothing is hardcoded).
- Search by name, filter by category, sort by price.
- Smart search: several keywords, price range and availability in one sentence, e.g. `rose candle under 100 in stock`.
- Product detail page with stock level and the maker's name.
- Registration and login with Supabase Auth.
- Shopping cart saved in `localStorage`.
- Checkout that saves the order in `orders` and its products in `order_items`.
- Order confirmation page and order history.
- Customer reviews and ratings (the additional feature): post, edit and delete your own review.
- Analytics dashboard for staff: total sales, orders, most popular products, sales by category, low stock.
- Staff product management: add, edit and delete products.
- Works on desktop and mobile screens.

## Technologies

| Technology | Used for |
| --- | --- |
| HTML5 | Pages and forms |
| CSS3 | Layout, design and mobile view |
| JavaScript | All application logic |
| Supabase (PostgreSQL) | Database |
| Supabase Auth | Registration and login |
| Supabase REST API | Reading and writing data from the browser |
| GitHub | Source code |
| GitHub Pages | Hosting |

## Project structure

```
handmade-marketplace/
├── index.html            Home page
├── products.html         Shop: search, filter, sort
├── product-detail.html   One product and its reviews
├── about.html            About the project
├── register.html         Create an account
├── login.html            Log in
├── cart.html             Shopping cart
├── checkout.html         Delivery details and place order
├── confirmation.html     Order confirmation
├── account.html          Profile and order history
├── dashboard.html        Analytics dashboard (staff only)
├── css/style.css         All styles
├── js/
│   ├── app.js            Supabase connection, helpers, cart, header
│   ├── home.js           Home page
│   ├── products.js       Shop and smart search
│   ├── product-detail.js Product and reviews
│   ├── auth.js           Register and login
│   ├── cart.js           Cart page
│   ├── checkout.js       Checkout
│   ├── confirmation.js   Order confirmation
│   ├── account.js        Profile and orders
│   └── dashboard.js      Analytics and product management
├── images/               Original illustrations made for this project
└── database/database.sql Tables, triggers, RLS policies, sample data
```

## Database structure

| Table | Purpose | Key relationships |
| --- | --- | --- |
| `category` | Product categories | |
| `product` | Products, price, stock | `category_id` → `category.id` |
| `customers` | One row per registered user | `id` → `auth.users.id` |
| `orders` | One row per checkout | `customer_id` → `customers.id` |
| `order_items` | Products inside each order | `order_id` → `orders.id`, `product_id` → `product.id` |
| `reviews` | Ratings and comments | `product_id` → `product.id`, `customer_id` → `customers.id` |

Two views support the analytics: `product_rating` (average rating per product) and `product_sales` (units sold and revenue per product).

### REST API operations

| Operation | Example in the application | Table |
| --- | --- | --- |
| SELECT | Load products, reviews, orders | `product`, `reviews`, `orders` |
| INSERT | Place an order, post a review, add a product | `orders`, `order_items`, `reviews`, `product` |
| UPDATE | Edit profile, edit a review, change order status, change stock | `customers`, `reviews`, `orders`, `product` |
| DELETE | Delete a review, delete a product | `reviews`, `product` |

### Security

- Row Level Security is enabled on every table.
- Customers can read and change only their own profile, orders and reviews.
- The browser never sends a price or an order total. A database trigger copies the real price, checks the stock and calculates the total.
- Customers cannot change the `is_admin` column, so they cannot make themselves staff.
- Only the Supabase publishable key is in the code. The service-role key and the database password are not in this repository.
- All text from the database is escaped before it is shown, to prevent cross-site scripting.

## Running the project

**Use the live website:** open the GitHub Pages link above.

**Run it locally:**

1. Clone the repository.
2. Start any static web server in the project folder, for example `python -m http.server 8080`.
3. Open `http://localhost:8080`.

**Set up your own database:**

1. Create a project at [supabase.com](https://supabase.com).
2. Open the SQL Editor, paste `database/database.sql` and run it.
3. Put your Project URL and publishable key at the top of `js/app.js`.
4. Register on the website, then run this in the SQL Editor to make your account staff:

```sql
update public.customers set is_admin = true where email = 'your-email@example.com';
```

## Notice

This is a student project. The products are sample data. No real payments are taken and no real deliveries are made.
