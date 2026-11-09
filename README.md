# I’m Your Eyes (web app, v2)

Point the camera at banknotes. It says the amount automatically, and with 2, 3 or more notes
it says the count and the total, e.g. "2 notes, total 70,000 kip". Tap anywhere to hear it again.

## Deploy (Vercel)
`npm i -g vercel`, then `vercel` inside this folder (framework "Other", no build command).
Open the https link in iPhone Safari, Share > Add to Home Screen. (After deploying an update, open the app twice to pick it up.)

## Model (needed for real recognition)
Counting several notes needs an OBJECT DETECTOR, not a plain classifier.
1. Photograph notes (1 to 3 at a time, side by side, not overlapping), different light/backgrounds.
2. Label each note with a box + its value (Roboflow or Label Studio), classes = values in model/labels.json.
3. Train YOLOv8n (Ultralytics), then export: `yolo export model=best.pt format=tfjs imgsz=416`
4. Put `model.json` + the `.bin` files into `model/`.
Without model.json the app starts in demo mode (Demo button simulates 1 to 3 notes).

## Voice
Best: record the short Lao word clips listed in audio/README.txt (works on every phone, offline).
Otherwise it uses the phone's Lao voice if it has one, and English if not.
The app speaks by itself, so screen-reader output is not duplicated.

## Safety rules
- A note is only counted at or above `minConfidence` (labels.json), and the same result must hold for 3 frames in a row.
- Overlapping boxes are merged so one note is never counted twice.
- If it cannot settle on an answer for 4 seconds it says "please try again" instead of guessing.
