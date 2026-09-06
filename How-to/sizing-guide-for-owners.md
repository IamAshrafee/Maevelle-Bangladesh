# Sizing Module — User Guide

## 1. What is the Sizing Module?

The Sizing module is where you manage everything related to how clothing, accessories, or other products fit your customers. Instead of just writing "Small" or "Large" in a product description, this module allows you to build complete, accurate Size Guides (like a measurement chart) that customers can use on your storefront to find their perfect fit.

## 2. What can I do with Sizing?

With the current implementation, you can:
* Create **Sizing Domains** (high-level groups like "Women's Clothing" or "Men's Shoes").
* Define exactly what **Measurements** you care about (e.g., Chest, Waist, Inseam in cm or inches).
* Build reusable **Size Guides** (measurement charts).
* Provide **Fit Notes** and **How to Measure** instructions for your customers.
* Connect a Size Guide to a specific Product.
* Assign a default Size Guide to an entire Category (so all products in that category automatically use it).
* Offer a **"Find My Size Calculator"** on the customer storefront, which automatically recommends the best size based on the customer's personal measurements.

## 3. Before You Start

Before you start creating size guides, you should have a basic understanding of your inventory. If you plan to set category-wide sizing defaults, ensure you have already created your Categories in the Product Organization module.

## 4. Understanding the Sizing Structure

To keep your sizing organized and reusable, the system uses a specific structure. You must create things in a specific order:

1. **Sizing Domain:** The highest category (e.g., "International Women's Tops").
2. **Measurement Definitions:** The specific physical dimensions you measure (e.g., "Chest", "Waist").
3. **Size Systems:** A regional or standard grouping of sizes (e.g., "US Women's").
4. **Size Definitions:** The actual size labels (e.g., "S", "M", "L").
5. **Size Guides:** The actual chart that connects your Size Definitions to your Measurement Definitions with exact numbers (e.g., Size M means Chest 90-95cm).

## 5. Understanding "Sizing Domain"

**What is it?** 
A Sizing Domain is the foundation of your sizing. It acts as a "folder" that groups related measurements and size guides together. 

**Why does it exist?**
Because a pair of shoes and a dress require completely different measurements. You cannot use a "Chest" measurement for a shoe. By creating a Sizing Domain for "Dresses" and another for "Footwear", you ensure that your Size Guides only ask for the correct measurements.

**When to create one:**
You must create a Sizing Domain *before* you can create any measurements, size systems, or size guides.

**Important Rule:** 
When creating a domain, you must choose a "Subject" (Body, Garment, or Product). This tells the system whether the measurements describe the human body or the actual flat garment.

## 6. Creating Sizing Information (Step-by-Step)

Here is the exact order you must follow to create your first Size Guide:

### Step A: Create a Domain & System
1. Go to **Domains & Systems** on the left menu.
2. Under **New Sizing domain**, enter a Name (e.g., "Women's Dresses") and Code (e.g., "womens-dresses"). Choose the Subject. Click **Add domain**.
3. Under **New Size system**, select the Domain you just created. Enter a Name (e.g., "Standard US Women's") and Code. Click **Add system**.

### Step B: Create Measurements
1. Go to **Measurements** on the left menu.
2. Select your Domain.
3. Enter the Name of the measurement (e.g., "Bust").
4. Choose the default unit (cm or inch). 
5. Click **Add measurement**. Repeat for "Waist", "Hips", etc.

### Step C: Define Your Sizes
1. Go to **Size Definitions** on the left menu.
2. Select your Size System.
3. Add your size labels one by one (e.g., enter "Small", code "s", sort order "1", then "Medium", code "m", sort order "2").

### Step D: Create the Size Guide
1. Go to **Size Guides** on the left menu.
2. Click the **+ Create Guide** button at the top right.
3. Enter a Guide Name (e.g., "Summer Dresses Size Guide") and select your Sizing Domain. Click **Create & Open**.

### Step E: Fill Out the Size Guide Matrix
1. You are now in the **Size Guide Editor**. 
2. Under **Fit Notes & Guidance**, you can optionally type Fit Notes (e.g., "True to size") and General Instructions (e.g., "Measure around the fullest part of your chest").
3. Under **Measurement Matrix**, type a size label (e.g., "S") and click **Add Size Row**. 
4. Click on the empty cells (showing "+ Set") to open the editor. Enter the exact measurement, or the Min and Max range (e.g., Min 85, Max 90). Click **Save**.
5. Repeat for all sizes.

## 7. Publishing and Editing Size Guides

This system uses **Revisions** (versions) to protect your data. 

**Draft vs. Published:**
When you create a Size Guide, it starts as a **Draft**. Customers *cannot* see a Draft. 
Once your chart is complete, you must click the green **Publish Revision** button.

**Editing a Published Guide:**
Once a revision is Published, it becomes **Locked & Immutable** (you cannot change the numbers). This prevents accidental changes to historical data. 
If you need to fix a typo or update the sizing for next season:
1. Open the Size Guide.
2. Click the **+ New Draft** button on the left sidebar.
3. The system will copy your published chart into a new Draft.
4. Make your changes to the Draft.
5. Click **Publish Revision** to replace the old guide.

## 8. Archiving Sizing Information

You **cannot permanently delete** sizing information. Instead, you **Archive** it.
* To archive a Domain, System, Size, or Measurement, click the red **Archive** button next to it in its respective list.
* To archive a Size Guide, you must open it and use the archive option (if available), or delete it via the API. 
* **Important Restriction:** You cannot archive a Domain if it still has active Size Guides or Systems inside it. You must archive the contents first. You cannot archive a Size Definition if a product is actively using it.

## 9. Connecting Sizing With Products

For a customer to see the Size Guide on the storefront, the product must know which guide to use. There are two ways to do this:

### Method A: Category Defaults (Fastest)
1. Go to **Category Defaults** in the Sizing menu.
2. You will see a list of all your product categories.
3. Use the dropdown next to a category to select a *Published* Size Guide.
4. Now, *every* product in that category will automatically display that Size Guide on the storefront.

### Method B: Specific Product Override
1. Go to the **Products / Catalogue** module and edit a specific product.
2. Scroll to the **Sizing** section.
3. Select the **Size System** this product uses.
4. Under **Size Guide**, you can select a specific guide, or leave it as "Use category default".
5. Click **Save Sizing**.

## 10. Real-Life Business Example

**Scenario:** You sell a Women's Kurti and want customers to use a "Find My Size" calculator.

1. **Domain:** Create a Domain called "Women's Kurtis".
2. **Measurements:** Create measurements for "Bust", "Waist", and "Length" under this domain.
3. **System & Sizes:** Create a System called "Kurti Standard" and add sizes: S, M, L, XL.
4. **Size Guide:** Create a Size Guide called "Standard Kurti Fit". Add the rows (S, M, L, XL) and fill in the measurements for Bust, Waist, and Length.
5. **Publish:** Click "Publish Revision".
6. **Connect:** Go to **Category Defaults**, find your "Kurtis" category, and select "Standard Kurti Fit" from the dropdown.

Now, any Kurti you add to that category will show this exact size chart to the customer.

## 11. Common Situations

* **"I created a Size Guide but I can't select it for my Product!"**
  You probably forgot to click **Publish Revision**. Products can only be attached to *Published* guides.
* **"I made a mistake in my published Size Guide!"**
  Open the guide, click **+ New Draft**, fix the mistake, and click **Publish Revision**. 
* **"Can I reuse the same Size Guide for multiple products?"**
  Yes! A single Size Guide can be attached to hundreds of products, or set as a Category Default.
* **"I have sizing data in a spreadsheet. Do I have to type it all manually?"**
  No. When editing a Draft Size Guide, click the **Import CSV** button to upload your spreadsheet directly.

## 12. Sizing → Product → Customer Flow

Here is the exact journey of your sizing data:

**Step 1:** Admin creates the Domain, Measurements, and a Size Guide.
↓
**Step 2:** Admin fills in the chart and clicks **Publish Revision**.
↓
**Step 3:** Admin assigns the Size Guide to a Product (or sets it as a Category Default).
↓
**Step 4:** Customer views the product on the storefront and clicks "Size Guide".
↓
**Step 5:** Customer sees your measurement chart, reads your Fit Notes, and can use the **Find My Size Calculator** to enter their own measurements and get an automatic size recommendation.

## 13. Important Rules and Limitations

* **No Deletion:** Data is strictly archived, never hard-deleted, to preserve order history accuracy.
* **Drafts vs Published:** Only one revision can be published at a time. Drafts are invisible to customers.
* **Empty Guides:** You cannot publish a Size Guide unless it has at least one row, and every row has at least one measurement filled in.
* **Exact vs Range:** When filling in a measurement cell, you must provide either an Exact number, OR both a Min and Max number. You cannot provide just a Min.
* **Unit Conversion:** The storefront will automatically convert cm to inches (and vice versa) for the customer, so you only need to enter data in your default unit.

## 14. Quick Start Checklist

To get up and running immediately, follow these exact steps:
1. [ ] Go to **Domains & Systems** and create a Domain.
2. [ ] Stay on **Domains & Systems** and create a System attached to that Domain.
3. [ ] Go to **Measurements** and add your dimensions (e.g., Chest).
4. [ ] Go to **Size Definitions** and add your sizes (e.g., S, M, L).
5. [ ] Go to **Size Guides**, create a guide, fill out the matrix, and click **Publish Revision**.
6. [ ] Go to **Category Defaults** and assign your new guide to a product category.
