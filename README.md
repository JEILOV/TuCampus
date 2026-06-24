# TuCampus

TuCampus is a university marketplace platform designed to connect students inside campus and make buying and selling easier.

The project was created to solve a common problem observed in university environments: students who sell food, desserts, study materials or small services often spend hours physically searching for customers around campus.

TuCampus centralizes these offers in a digital catalog where students can publish products and other students can discover and contact sellers directly.

---

## Problem Solved

Many university students generate income by selling products inside campus.

Common challenges:

- Sellers lose time walking around faculties searching for buyers
- Buyers often do not know who is selling products nearby
- There is no centralized marketplace focused exclusively on university students

TuCampus was built to reduce this friction.

---

## Main Features

- Student authentication restricted to institutional university emails
- Product publishing system
- Product catalog with category filters
- Seller profile pages
- Favorite products system
- Follow sellers functionality
- Notifications when followed sellers publish new products
- Seller phone verification requirement before publishing
- Product editing functionality
- Independent product sharing system
- Pagination system to optimize product loading
- Search system optimized for large product catalogs

---

## Tech Stack

Frontend:

- HTML
- CSS
- JavaScript
- React

Backend / Services:

- Firebase Authentication
- Firebase Firestore
- Firebase Storage

External Services:

- ImgBB API for image uploads

Deployment:

- Vercel

Version Control:

- Git
- GitHub

---

## Product Thinking Decisions

During development several UX decisions were made:

- Replaced image URL input with direct gallery upload because mobile users found URLs inconvenient
- Forced phone number registration before allowing product publication
- Redirected users directly to profile setup when required information was missing
- Limited simultaneous publications to reduce backend abuse
- Optimized search architecture to avoid downloading full catalog unnecessarily

The focus was not only building functionality but improving usability for real student users.

---

## Live Demo

[Open Project](https://unp-market.vercel.app)

---

## Future Improvements

- Seller rating system
- Automatic social-media-friendly product card generation
- SMS verification for seller identity
- Advanced recommendation system
- Better analytics for sellers

---

## Author

Jordan Josue Pardo Leon

Computer Engineering Student — Universidad Nacional de Piura

GitHub: https://github.com/JEILOV
