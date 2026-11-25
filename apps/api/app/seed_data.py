"""Seed constants.

Published company facts were read from https://www.knightsky.in/ on 2026-11-25.
Everything here is editable in Company settings. The clause text is neutral
starter copy for development, not legal advice; replace it with company-approved
terms before issuing real offers.
"""

COMPANY = {
    "name": "MR. ELECTRICAL WORKS",
    "legal_name": "MR ELECTRIC WORKS",
    "tagline": "Turnkey Electrical Engineering & Contracting",
    "website": "https://www.knightsky.in",
    "email": "mrelectricalworks02@gmail.com",
    "phone": "+91 85199 49762",
    "address_line1": "No. 83, Gokul Nagar",
    "address_line2": None,
    "city": "Patancheru",
    "state": "Telangana",
    "postal_code": "502319",
    "country": "India",
    "udyam_number": "UDYAM-TS-25-0046549",
    "gst_number": None,
    "cin_number": None,
    "logo_url": "/brand/logo.png",
    "primary_color": "#B35010",
    "accent_color": "#0E639C",
    "signatory_name": "Nekbor Seikh",
    "signatory_title": "GM – Projects",
    "signatory_email": "mrelectricalworks02@gmail.com",
    "footer_note": (
        "Registered office: No. 83, Gokul Nagar, Patancheru, Hyderabad, Telangana 502319. "
        "Udyam registration: UDYAM-TS-25-0046549."
    ),
    "offer_prefix": "MEW-OL",
    "default_validity_days": 14,
    "default_probation_months": 3,
    "default_work_location": "Patancheru, Hyderabad, Telangana",
    "default_working_days": "Monday to Saturday",
    "default_working_hours": "9:00 AM to 6:00 PM",
}

DEFAULT_TERMS = {
    "probation": (
        "The first three months of employment are a probation period. Confirmation is subject to "
        "performance, conduct and the company's confirmation decision."
    ),
    "leave_policy": (
        "Leave is governed by the company's leave policy and applicable law. Leave requests must be "
        "made through your reporting manager."
    ),
    "working_hours": (
        "Standard working hours are 9:00 AM to 6:00 PM, Monday to Saturday, with breaks as applicable. "
        "Site requirements may require a revised roster."
    ),
    "confidentiality": (
        "You must keep company, client, project and employee information confidential during and after "
        "employment. This obligation does not restrict lawful disclosures."
    ),
    "notice_period": (
        "Either party may end employment by giving the notice period stated in company policy or "
        "applicable law. The company may pay salary in lieu of notice where permitted."
    ),
    "termination": (
        "The company may terminate employment for cause, including misconduct, repeated breach of policy "
        "or failure to meet agreed responsibilities, in accordance with applicable law."
    ),
    "company_policies": (
        "You agree to follow company policies, site safety rules, client site requirements and lawful "
        "instructions from your reporting manager."
    ),
    "joining_requirements": (
        "Bring identity proof, address proof, educational certificates, prior employment documents and "
        "bank details. Site roles may require safety training and medical fitness documentation."
    ),
    "additional_clauses": "",
}

DEFAULT_TRAINING_POLICY = {
    "enabled": True,
    "training_period_months": 1,
    "training_monthly_salary_inr": 14000,
    "food_provided": False,
    "site_accommodation_free": True,
    "post_training_salary_min_inr": 18000,
    "post_training_salary_max_inr": 25000,
    "post_training_duration_months": 6,
    "first_increment_after_months": 6,
    "first_increment_max_percent": 30,
    "increment_criteria": "Behaviour and performance",
}

DEFAULT_BLOCKS = [
    {
        "key": "training_and_increment_policy",
        "name": "Training & increment policy",
        "description": "MR. ELECTRICAL WORKS standard training period, site facilities, post-training salary band, and first increment progression.",
        "content": (
            "<div class='training-policy-block'><table class='money'><thead><tr>"
            "<th>Stage</th><th>Duration / Window</th><th>Compensation / Revision</th><th>Site Facilities &amp; Evaluation</th>"
            "</tr></thead><tbody>"
            "<tr><td><strong>1st Month Training Period</strong></td><td>Month 1 (1 Month)</td>"
            "<td><strong>₹14,000/month</strong></td>"
            "<td>No food provided<br>Free accommodation if staying at the working site</td></tr>"
            "<tr><td><strong>Post-Training Salary</strong></td><td>Months 2–7 (6 Months)</td>"
            "<td><strong>₹18,000 – ₹25,000/month</strong></td>"
            "<td>Performance-based revision continuing for 6 months.</td></tr>"
            "<tr><td><strong>First Increment</strong></td><td>After 6 months</td>"
            "<td><strong>Up to 30% increment</strong></td>"
            "<td>Reviewed after 6 months of post-training salary based on Behaviour and performance.</td></tr>"
            "</tbody></table></div>"
        ),
    },
    {
        "key": "leave_policy",
        "name": "Leave policy",
        "description": "Reusable leave clause for templates.",
        "content": DEFAULT_TERMS["leave_policy"],
    },
    {
        "key": "joining_requirements",
        "name": "Joining requirements",
        "description": "Documents and checks required on the joining date.",
        "content": DEFAULT_TERMS["joining_requirements"],
    },
    {
        "key": "confidentiality",
        "name": "Confidentiality",
        "description": "Reusable confidentiality clause.",
        "content": DEFAULT_TERMS["confidentiality"],
    },
    {
        "key": "notice_period",
        "name": "Notice period",
        "description": "Reusable notice-period clause.",
        "content": DEFAULT_TERMS["notice_period"],
    },
]

ROLES = [
    ("SUPER_ADMIN", "Super Admin", "Full system access, company settings, users, templates and audit logs."),
    ("HR_MANAGER", "HR Manager", "Candidates, offers, approval submissions, issuing and candidate responses."),
    ("HIRING_MANAGER", "Hiring Manager", "Review offers, approve or return them for correction."),
]

POSITIONS = [
    ("Site Electrical Engineer", "Projects"),
    ("Project Engineer", "Projects"),
    ("Electrical Draftsman", "Design"),
    ("Site Supervisor", "Projects"),
    ("Procurement Executive", "Procurement"),
    ("Accounts Assistant", "Finance"),
    ("Safety Officer", "Safety"),
    ("Apprentice Electrician", "Projects"),
]

DEMO_CANDIDATES = [
    {
        "full_name": "Aarav Sharma",
        "email": "aarav.sharma@example.com",
        "phone": "+91 90000 11001",
        "current_address": "12-4-88, Ramachandrapuram, Hyderabad, Telangana 502032",
        "applied_position": "Site Electrical Engineer",
        "department": "Projects",
        "employment_type": "FULL_TIME",
        "reporting_manager": "Nekbor Seikh",
        "work_location": "Patancheru, Hyderabad",
    },
    {
        "full_name": "Meera Iyer",
        "email": "meera.iyer@example.com",
        "phone": "+91 90000 11002",
        "current_address": "Flat 304, Sai Residency, Miyapur, Hyderabad, Telangana 500049",
        "applied_position": "Project Engineer",
        "department": "Projects",
        "employment_type": "FULL_TIME",
        "reporting_manager": "Nekbor Seikh",
        "work_location": "Patancheru, Hyderabad",
    },
    {
        "full_name": "Rohit Reddy",
        "email": "rohit.reddy@example.com",
        "phone": "+91 90000 11003",
        "current_address": "8-1-21, Beeramguda, Sangareddy, Telangana 502032",
        "applied_position": "Electrical Draftsman",
        "department": "Design",
        "employment_type": "FULL_TIME",
        "reporting_manager": "Nekbor Seikh",
        "work_location": "Patancheru, Hyderabad",
    },
    {
        "full_name": "Sana Khan",
        "email": "sana.khan@example.com",
        "phone": "+91 90000 11004",
        "current_address": "16-2-147, Bolarum, Hyderabad, Telangana 500010",
        "applied_position": "Procurement Executive",
        "department": "Procurement",
        "employment_type": "FULL_TIME",
        "reporting_manager": "Nekbor Seikh",
        "work_location": "Patancheru, Hyderabad",
    },
    {
        "full_name": "Vikram Naidu",
        "email": "vikram.naidu@example.com",
        "phone": "+91 90000 11005",
        "current_address": "Plot 22, Ameenpur, Sangareddy, Telangana 502032",
        "applied_position": "Site Supervisor",
        "department": "Projects",
        "employment_type": "CONTRACT",
        "reporting_manager": "Nekbor Seikh",
        "work_location": "Pashamylaram, Sangareddy",
    },
    {
        "full_name": "Priya Menon",
        "email": "priya.menon@example.com",
        "phone": "+91 90000 11006",
        "current_address": "Flat 12B, Lake View Apartments, Gachibowli, Hyderabad 500032",
        "applied_position": "Accounts Assistant",
        "department": "Finance",
        "employment_type": "FULL_TIME",
        "reporting_manager": "Nekbor Seikh",
        "work_location": "Patancheru, Hyderabad",
    },
    {
        "full_name": "Imran Ali",
        "email": "imran.ali@example.com",
        "phone": "+91 90000 11007",
        "current_address": "5-9-33, Kukatpally, Hyderabad, Telangana 500072",
        "applied_position": "Safety Officer",
        "department": "Safety",
        "employment_type": "FULL_TIME",
        "reporting_manager": "Nekbor Seikh",
        "work_location": "Patancheru, Hyderabad",
    },
    {
        "full_name": "Divya Rao",
        "email": "divya.rao@example.com",
        "phone": "+91 90000 11008",
        "current_address": "3-11-6, Gokul Nagar, Patancheru, Telangana 502319",
        "applied_position": "Apprentice Electrician",
        "department": "Projects",
        "employment_type": "INTERNSHIP",
        "reporting_manager": "Nekbor Seikh",
        "work_location": "Patancheru, Hyderabad",
    },
]

DEMO_USERS = [
    ("admin@mrelectricalworks.in", "System Administrator", "SUPER_ADMIN", None),
    ("hr@mrelectricalworks.in", "HR Manager", "HR_MANAGER", "HrManager!2026"),
    ("hiring@mrelectricalworks.in", "Hiring Manager", "HIRING_MANAGER", "HiringManager!2026"),
]
