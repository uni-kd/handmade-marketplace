-- =====================================================================
-- Handmade Products Marketplace - INT424 Final Project
-- Database script for Supabase (PostgreSQL)
--
-- How to use: Supabase dashboard -> SQL Editor -> paste this whole file
-- -> Run. The script can be run again safely. It drops and rebuilds
-- everything, so running it again deletes existing orders and reviews.
--
-- Sections:
--   1. Clean up (drop old objects)
--   2. Tables
--   3. Functions and triggers
--   4. Views for analytics
--   5. Permissions (GRANT)
--   6. Row Level Security (RLS) policies
--   7. Sample data
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. CLEAN UP
-- ---------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
drop view if exists public.product_sales;
drop view if exists public.product_rating;
drop table if exists public.reviews cascade;
drop table if exists public.order_items cascade;
drop table if exists public.orders cascade;
drop table if exists public.customers cascade;
drop table if exists public.product cascade;
drop table if exists public.category cascade;
drop function if exists public.handle_new_user();
drop function if exists public.process_order_item();
drop function if exists public.set_review_author();
drop function if exists public.is_admin();


-- ---------------------------------------------------------------------
-- 2. TABLES
-- ---------------------------------------------------------------------

-- Product categories (jewelry, candles, ...)
create table public.category (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  description text
);

-- Products sold on the marketplace. Prices are in AED.
create table public.product (
  id          bigint generated always as identity primary key,
  category_id bigint not null references public.category (id),
  name        text not null,
  description text not null,
  maker       text not null,                      -- the artisan who made it
  price       numeric(10, 2) not null check (price >= 0),
  stock       integer not null default 0 check (stock >= 0),
  image_url   text,
  created_at  timestamptz not null default now()
);

-- One row per registered user. The id is the same id Supabase Auth
-- gives the user, so a customer row always belongs to one login.
create table public.customers (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null,
  email      text not null,
  phone      text,
  address    text,
  is_admin   boolean not null default false,      -- store staff
  created_at timestamptz not null default now()
);

-- One row per checkout.
create table public.orders (
  id               bigint generated always as identity primary key,
  customer_id      uuid not null default auth.uid()
                     references public.customers (id) on delete cascade,
  order_date       timestamptz not null default now(),
  status           text not null default 'pending'
                     check (status in ('pending', 'shipped', 'delivered', 'cancelled')),
  total            numeric(10, 2) not null default 0 check (total >= 0),
  shipping_address text not null,
  phone            text not null
);

-- The products inside each order.
create table public.order_items (
  id         bigint generated always as identity primary key,
  order_id   bigint not null references public.orders (id) on delete cascade,
  product_id bigint not null references public.product (id),
  quantity   integer not null check (quantity > 0),
  unit_price numeric(10, 2) not null              -- price at the time of purchase
);

-- Customer reviews and ratings (the additional feature of this project).
-- A customer can review each product only once.
create table public.reviews (
  id            bigint generated always as identity primary key,
  product_id    bigint not null references public.product (id) on delete cascade,
  customer_id   uuid not null default auth.uid()
                  references public.customers (id) on delete cascade,
  reviewer_name text not null,
  rating        integer not null check (rating between 1 and 5),
  comment       text not null,
  created_at    timestamptz not null default now(),
  unique (product_id, customer_id)
);

-- Indexes on the foreign keys used most by the website.
create index product_category_idx  on public.product (category_id);
create index orders_customer_idx   on public.orders (customer_id);
create index order_items_order_idx on public.order_items (order_id);
create index reviews_product_idx   on public.reviews (product_id);


-- ---------------------------------------------------------------------
-- 3. FUNCTIONS AND TRIGGERS
-- ---------------------------------------------------------------------

-- 3.1 When someone registers through Supabase Auth, create their
--     customers row automatically. The name comes from the register form.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.customers (id, full_name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'Customer'),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- 3.2 Returns true when the logged-in user is store staff.
--     Used inside the RLS policies below.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.customers
    where id = auth.uid() and is_admin
  );
$$;


-- 3.3 Runs for every product added to an order. The website only sends
--     the product and the quantity. The database itself:
--       - checks that enough stock is left,
--       - copies the real price from the product table,
--       - reduces the stock,
--       - adds the amount to the order total.
--     This stops a user from editing the price in the browser.
create function public.process_order_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  select name, price, stock into p
  from public.product
  where id = new.product_id
  for update;

  if not found then
    raise exception 'Product not found';
  end if;

  if p.stock < new.quantity then
    raise exception 'Not enough stock for "%" (only % left)', p.name, p.stock;
  end if;

  new.unit_price := p.price;

  update public.product
  set stock = stock - new.quantity
  where id = new.product_id;

  update public.orders
  set total = total + p.price * new.quantity
  where id = new.order_id;

  return new;
end;
$$;

create trigger order_item_before_insert
  before insert on public.order_items
  for each row execute function public.process_order_item();


-- 3.4 Stamps each new review with the real user and their real name,
--     so nobody can post a review under someone else's name.
create function public.set_review_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.customer_id := auth.uid();
  select full_name into new.reviewer_name
  from public.customers
  where id = auth.uid();
  return new;
end;
$$;

create trigger review_before_insert
  before insert on public.reviews
  for each row execute function public.set_review_author();


-- ---------------------------------------------------------------------
-- 4. VIEWS FOR ANALYTICS
--    security_invoker = true means the views follow the RLS policies of
--    the person who is looking, so they never leak private rows.
-- ---------------------------------------------------------------------

-- Average rating and number of reviews per product.
create view public.product_rating
with (security_invoker = true) as
select
  product_id,
  round(avg(rating), 1) as avg_rating,
  count(*)              as review_count
from public.reviews
group by product_id;

-- Units sold and revenue per product (cancelled orders are not counted).
create view public.product_sales
with (security_invoker = true) as
select
  p.id                              as product_id,
  p.name                            as product_name,
  c.name                            as category_name,
  sum(oi.quantity)                  as units_sold,
  sum(oi.quantity * oi.unit_price)  as revenue
from public.order_items oi
join public.orders   o on o.id = oi.order_id
join public.product  p on p.id = oi.product_id
join public.category c on c.id = p.category_id
where o.status <> 'cancelled'
group by p.id, p.name, c.name;


-- ---------------------------------------------------------------------
-- 5. PERMISSIONS
--    Start from nothing, then give each role only what it needs.
--    anon          = visitors who are not logged in
--    authenticated = logged-in users
-- ---------------------------------------------------------------------
revoke all on public.category, public.product, public.customers,
              public.orders, public.order_items, public.reviews,
              public.product_rating, public.product_sales
  from anon, authenticated;

revoke execute on function public.handle_new_user()    from public, anon, authenticated;
revoke execute on function public.process_order_item() from public, anon, authenticated;
revoke execute on function public.set_review_author()  from public, anon, authenticated;
revoke execute on function public.is_admin()           from public, anon;
grant  execute on function public.is_admin()           to authenticated;

-- Everyone can browse the catalogue and read reviews.
grant select on public.category, public.product,
                public.reviews, public.product_rating
  to anon, authenticated;

-- Staff manage the catalogue (the RLS policies check is_admin).
grant insert, update, delete on public.category, public.product to authenticated;

-- Customers can read their profile and change ONLY these three columns.
-- is_admin is not in the list, so a user cannot make themselves staff.
grant select on public.customers to authenticated;
grant update (full_name, phone, address) on public.customers to authenticated;

-- Customers create orders, but cannot send a total or a status.
grant select, delete on public.orders to authenticated;
grant insert (shipping_address, phone) on public.orders to authenticated;
grant update (status) on public.orders to authenticated;

-- Customers add items, but cannot send a price.
grant select on public.order_items to authenticated;
grant insert (order_id, product_id, quantity) on public.order_items to authenticated;

-- Customers write, edit and delete their own reviews.
grant insert (product_id, rating, comment) on public.reviews to authenticated;
grant update (rating, comment) on public.reviews to authenticated;
grant delete on public.reviews to authenticated;

grant select on public.product_sales to authenticated;


-- ---------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
--    With RLS on, a table returns no rows unless a policy allows it.
-- ---------------------------------------------------------------------
alter table public.category    enable row level security;
alter table public.product     enable row level security;
alter table public.customers   enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;
alter table public.reviews     enable row level security;

-- category: public read, staff write
create policy "Anyone can view categories"
  on public.category for select to anon, authenticated using (true);
create policy "Staff can add categories"
  on public.category for insert to authenticated with check (public.is_admin());
create policy "Staff can edit categories"
  on public.category for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Staff can delete categories"
  on public.category for delete to authenticated using (public.is_admin());

-- product: public read, staff write
create policy "Anyone can view products"
  on public.product for select to anon, authenticated using (true);
create policy "Staff can add products"
  on public.product for insert to authenticated with check (public.is_admin());
create policy "Staff can edit products"
  on public.product for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Staff can delete products"
  on public.product for delete to authenticated using (public.is_admin());

-- customers: each user sees and edits only their own row
create policy "Customers can view their own profile"
  on public.customers for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy "Customers can edit their own profile"
  on public.customers for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- orders: each user sees only their own orders, staff see all
create policy "Customers can view their own orders"
  on public.orders for select to authenticated
  using (customer_id = auth.uid() or public.is_admin());
create policy "Customers can create their own orders"
  on public.orders for insert to authenticated
  with check (customer_id = auth.uid());
create policy "Staff can update order status"
  on public.orders for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- Only an empty order can be deleted. The website uses this to remove
-- an order when checkout fails halfway (for example, out of stock).
create policy "Customers can delete their own empty orders"
  on public.orders for delete to authenticated
  using (
    customer_id = auth.uid()
    and not exists (
      select 1 from public.order_items oi where oi.order_id = orders.id
    )
  );

-- order_items: follow the order they belong to
create policy "Customers can view their own order items"
  on public.order_items for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.customer_id = auth.uid()
    )
  );
create policy "Customers can add items to their own pending orders"
  on public.order_items for insert to authenticated
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.customer_id = auth.uid()
        and o.status = 'pending'
    )
  );

-- reviews: public read, each user manages only their own review
create policy "Anyone can read reviews"
  on public.reviews for select to anon, authenticated using (true);
create policy "Customers can write reviews"
  on public.reviews for insert to authenticated
  with check (customer_id = auth.uid());
create policy "Customers can edit their own reviews"
  on public.reviews for update to authenticated
  using (customer_id = auth.uid()) with check (customer_id = auth.uid());
create policy "Customers can delete their own reviews"
  on public.reviews for delete to authenticated
  using (customer_id = auth.uid() or public.is_admin());


-- ---------------------------------------------------------------------
-- 7. SAMPLE DATA
-- ---------------------------------------------------------------------
insert into public.category (name, description) values
  ('Handmade Jewelry', 'Necklaces, bracelets, rings and earrings made by hand'),
  ('Decorations',      'Wall art, vases and pieces that finish a room'),
  ('Candles',          'Hand-poured candles in small batches'),
  ('Accessories',      'Bags, pouches and everyday items'),
  ('Gifts',            'Ready-to-give boxes and personalised pieces');

insert into public.product (category_id, name, description, maker, price, stock, image_url)
select c.id, v.name, v.description, v.maker, v.price, v.stock, v.image_url
from (values
  -- Handmade Jewelry
  ( 1, 'Handmade Jewelry', 'Pearl Drop Earrings',      'Freshwater pearl earrings on gold-plated hooks. Light enough to wear all day.',                 'Layla Studio',     85.00, 14, 'images/jewelry.svg'),
  ( 2, 'Handmade Jewelry', 'Arabic Name Necklace',     'Your name hand-cut in Arabic calligraphy on a fine chain. Made to order in three days.',       'Layla Studio',    160.00,  9, 'images/jewelry.svg'),
  ( 3, 'Handmade Jewelry', 'Beaded Turquoise Bracelet','Turquoise and brass beads strung by hand on an adjustable cord.',                              'Noor Beads',       45.00, 22, 'images/jewelry.svg'),
  ( 4, 'Handmade Jewelry', 'Silver Hammered Ring',     'Sterling silver band with a hand-hammered finish. Each ring is slightly different.',          'Noor Beads',      120.00,  4, 'images/jewelry.svg'),
  -- Decorations
  ( 5, 'Decorations',      'Macrame Wall Hanging',     'Cotton rope wall hanging knotted by hand on a driftwood bar. 60 cm wide.',                    'Knot & Thread',   140.00,  7, 'images/decor.svg'),
  ( 6, 'Decorations',      'Hand-Painted Ceramic Vase','Stoneware vase with a hand-painted geometric pattern. Holds water.',                          'Sharjah Clay',    110.00,  6, 'images/decor.svg'),
  ( 7, 'Decorations',      'Palm Leaf Basket',         'Basket woven from dried date palm leaves using the traditional khoos technique.',             'Al Khoos Crafts',  70.00, 15, 'images/decor.svg'),
  ( 8, 'Decorations',      'Calligraphy Wood Frame',   'Arabic calligraphy burned by hand into a walnut frame. 30 x 30 cm.',                          'Al Khoos Crafts', 195.00,  3, 'images/decor.svg'),
  -- Candles
  ( 9, 'Candles',          'Oud & Amber Candle',       'Soy wax candle with oud and amber. Burns for about 40 hours.',                                'Dar Candle Co.',   65.00, 30, 'images/candles.svg'),
  (10, 'Candles',          'Lavender Soy Candle',      'Soy wax candle with dried lavender. A calm scent for the bedroom.',                           'Dar Candle Co.',   55.00, 25, 'images/candles.svg'),
  (11, 'Candles',          'Rose Garden Candle Set',   'Three small rose-scented candles in a gift box.',                                             'Dar Candle Co.',   95.00, 12, 'images/candles.svg'),
  (12, 'Candles',          'Beeswax Pillar Candle',    'Pure beeswax pillar candle rolled by hand. No added scent.',                                  'Honey Light',      40.00,  0, 'images/candles.svg'),
  -- Accessories
  (13, 'Accessories',      'Embroidered Tote Bag',     'Canvas tote with hand-embroidered floral panel. Fits a laptop.',                              'Thread House',     90.00, 18, 'images/accessories.svg'),
  (14, 'Accessories',      'Leather Card Holder',      'Hand-stitched leather card holder with four slots.',                                          'Tan & Stitch',     75.00, 20, 'images/accessories.svg'),
  (15, 'Accessories',      'Crochet Phone Pouch',      'Crochet pouch with a shoulder strap. Fits most phones.',                                      'Thread House',     35.00,  5, 'images/accessories.svg'),
  (16, 'Accessories',      'Hand-Dyed Silk Scarf',     'Silk scarf dyed by hand in small batches. No two are the same.',                              'Thread House',    130.00,  8, 'images/accessories.svg'),
  -- Gifts
  (17, 'Gifts',            'Eid Gift Box',             'Gift box with a candle, dates bowl and a handwritten card.',                                  'Dar Candle Co.',  180.00, 10, 'images/gifts.svg'),
  (18, 'Gifts',            'Personalised Mug',         'Ceramic mug with a name painted by hand. Dishwasher safe.',                                   'Sharjah Clay',     60.00, 16, 'images/gifts.svg'),
  (19, 'Gifts',            'Handmade Soap Set',        'Four olive oil soaps, cut and wrapped by hand.',                                              'Honey Light',      50.00, 28, 'images/gifts.svg'),
  (20, 'Gifts',            'Resin Coaster Set',        'Set of four resin coasters with gold flakes.',                                                'Knot & Thread',    80.00,  2, 'images/gifts.svg')
) as v (sort_order, category_name, name, description, maker, price, stock, image_url)
join public.category c on c.name = v.category_name
order by v.sort_order;


-- ---------------------------------------------------------------------
-- AFTER YOU REGISTER ON THE WEBSITE
-- Run this once (with your own email) to make your account store staff,
-- so you can open the analytics dashboard and manage products:
--
--   update public.customers set is_admin = true
--   where email = 'your-email@example.com';
-- ---------------------------------------------------------------------
