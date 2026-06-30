# 🏡 PropertyFinder Data Import & Property Management System

A full-stack PropertyFinder data processing application that automates the import of scraped real estate listings into MongoDB Atlas and provides a web interface to browse, search, and manage property data.

## 🌐 Live Demo

### Frontend (Netlify)
🔗 https://glistening-otter-cb642b.netlify.app/

### Backend
Hosted on Railway.

> **Note:** The Railway dashboard link is for project management only. If deploying publicly, replace it with your Railway public domain (e.g., `https://your-app.up.railway.app`).

---

# 📖 Project Overview

This project was developed as part of an internship to automate the processing and storage of PropertyFinder real estate listings.

The application reads scraped property data from an Excel dataset, transforms and validates it using a Mongoose schema, and stores it in MongoDB Atlas. The imported data is then served through a Node.js/Express backend and displayed on a responsive frontend.

The system is designed to efficiently handle thousands of property listings while maintaining data integrity and providing a scalable architecture for future enhancements.

---

# ✨ Features

- 📄 Import property listings from Excel (.xlsx)
- 🗄 Store data in MongoDB Atlas
- 🔍 Search properties
- 🏙 Filter by city
- 🏠 Filter by property type
- 💰 Filter by price
- 🛏 Filter by bedrooms & bathrooms
- 📐 Filter by area
- 🖼 Display property images
- 📱 Responsive frontend
- ⚡ Fast MongoDB queries using indexing
- 📊 Clean and validated property data
- 🚀 REST API built with Express.js

---

# 🛠 Tech Stack

## Frontend

- HTML5
- CSS3
- JavaScript
- Bootstrap

## Backend

- Node.js
- Express.js
- Mongoose

## Database

- MongoDB Atlas

## Data Processing

- XLSX
- Excel Data Cleaning
- Batch Import

## Deployment

- Railway
- Netlify

---

# 📂 Project Structure

```
PropertyFinder/
│
├── client/
│   ├── index.html
│   ├── css/
│   ├── js/
│   └── assets/
│
├── server/
│   ├── models/
│   │      Property.js
│   │
│   ├── routes/
│   ├── controllers/
│   ├── import.js
│   ├── app.js
│   └── package.json
│
├── propertyfinder_detailed_properties.xlsx
│
└── README.md
```

---

# ⚙ Installation

Clone the repository

```bash
git clone https://github.com/harshilsomani907/your-repository-name.git
```

Move into the project

```bash
cd your-repository-name
```

Install dependencies

```bash
npm install
```

---

# 🔑 Environment Variables

Create a `.env` file.

```env
PORT=5000

MONGO_URI=your_mongodb_connection_string
```

Example

```env
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/propertyfinder
```

---

# ▶ Running the Application

Start backend

```bash
npm start
```

or

```bash
node app.js
```

Import Excel data

```bash
node import.js
```

---

# 📊 Data Import Workflow

```
PropertyFinder Excel Dataset
            │
            ▼
      Read using XLSX
            │
            ▼
Data Cleaning & Validation
            │
            ▼
Mongoose Schema Mapping
            │
            ▼
MongoDB Atlas
            │
            ▼
Express REST API
            │
            ▼
Frontend Dashboard
```

---

# 🗄 Database Schema

Each property contains information such as:

- Property Title
- Description
- Price
- Price Per Sqft
- Property Type
- Purpose
- Beds
- Baths
- Area
- Furnishing Status
- City
- City Area
- Location
- Amenities
- Parking Spaces
- Verification Status
- Property Survey Number
- Agent Details
- Listing Date

---

# 📈 Data Processing

The importer automatically:

- Removes currency symbols
- Removes commas
- Converts prices to numeric values
- Converts area into numbers
- Handles missing values
- Converts amenities into arrays
- Converts verification status to Boolean
- Performs batch insertion
- Validates records before inserting

---

# 🚀 API Features

- Get all properties
- Search properties
- Filter by city
- Filter by property type
- Filter by purpose
- Filter by bedrooms
- Filter by bathrooms
- Filter by price range
- Filter by area
- Pagination support

---

# 📸 Screenshots

### Home Page

_Add screenshots here_

### Property Listings

_Add screenshots here_

### MongoDB Atlas

_Add screenshots here_

---

# 📌 Future Improvements

- Authentication
- User Login
- Property Favorites
- Interactive Maps
- Advanced Filters
- AI Property Recommendations
- Scheduled Automatic Import
- Duplicate Detection
- Admin Dashboard
- Analytics Dashboard

---

# 👨‍💻 Author

**Harshil Somani**

GitHub:
https://github.com/harshilsomani907

LinkedIn:
_Add your LinkedIn profile here_

---

# 🙏 Acknowledgements

- MongoDB Atlas
- Railway
- Netlify
- Node.js
- Express.js
- Mongoose
- XLSX

---

# 📄 License

This project was developed for learning and internship purposes.
