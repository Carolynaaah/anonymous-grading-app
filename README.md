# Anonymous Grading – Single Page Application

## Overview
This project is a **Single Page Application (SPA)** that allows student projects to be evaluated by **anonymous juries of peers**.  
The goal is to simulate a realistic peer-grading workflow while keeping the system simple and focused on logic, permissions, and anonymity.

The application is implemented using **HTML, CSS, and vanilla JavaScript**, and runs entirely in the browser.

---

## Key Features

### User Roles
- **Student**
  - Can register and log in
  - Can create projects and deliverables if they are part of the project team (PM)
  - Can be randomly assigned as a jury member for other projects
  - Can submit and edit their own grades (within a limited time window)

- **Professor**
  - Can view all projects and deliverables
  - Can see submitted grades and final computed grades
  - Cannot see the identity of jury members (anonymous evaluation)

---

### Projects & Deliverables
- A project is created by a student team (PM).
- Each project can have multiple **partial deliverables**.
- Each deliverable has:
  - a due date
  - a jury size
  - an edit window (minutes after due date)
  - an optional project link (video or deployed app)

---

### Jury Assignment
- Jury members are **automatically and randomly selected** from eligible students.
- Eligibility rules:
  - must be a student
  - must not be part of the project team
- Jury assignment happens when the deliverable becomes due.
- If new eligible students register after the due date, the jury is **filled dynamically** until the target size is reached.

---

### Grading System
- Grades are values between **1 and 10**, with up to **2 decimal places**.
- Only jury members can submit grades.
- Each jury member can only modify **their own grade**.
- Grades can only be edited until the edit window expires.
- The **final grade** is computed by:
  - removing the lowest and highest grades
  - averaging the remaining values

---

### Anonymity & Permissions
- Jury member identities are **never displayed** to students or professors.
- Professors see only anonymous grade values.
- Permissions are strictly enforced in the UI logic.

---

## Authentication Model
This application uses a **simplified authentication model**:
- Users log in using a username only.
- No passwords are used.

This design choice is intentional, as the project focuses on **peer-grading logic and anonymity**, not on security or identity management.

---

## Technology Stack
- HTML5
- CSS3 (custom styling, no frameworks)
- Vanilla JavaScript
- Browser `localStorage` for persistence

---

## How to Run
1. Clone the repository
2. Open the folder in **Visual Studio Code**
3. Use **Live Server** or open `index.html` directly in a browser

No backend or build steps are required.

---

## Limitations
- Data is stored locally in the browser (localStorage).
- No real authentication or password security.
- No server-side validation.

These limitations are acceptable for a prototype and educational project.

---

## Authors
- **Gruiescu Ana-Bianca**
- **Lăzăroiu Teodora-Maria**
