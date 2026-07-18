# Artifact Interview Script

Do not pitch MergeVow during the first 30 minutes.

1. Show me the latest user-visible regression that passed CI.
2. Which PR caused it, and what evidence looked green at merge time?
3. Did tests or acceptance criteria change in that PR? Who reviewed them?
4. Which browser flow do you still check manually before merge?
5. How long does that check take and how often do you skip it?
6. What is missing from your current Playwright/Cypress coverage, and why?
7. How does the app start in CI? What auth, seed data, and external services are required?
8. Show the mock demo. Ask the interviewee to choose three checkpoints immediately.
9. Ask for a dated pilot on a real repository.

“Sounds useful” is not evidence. An artifact, scheduled pilot, installed check, or repeated use is.
