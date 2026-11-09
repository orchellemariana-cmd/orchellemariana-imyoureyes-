# I’m Your Eyes (web app)

Static site: no build step. Reads Lao kip notes with the camera and speaks the amount.

## Deploy on Vercel
- Easiest: `npm i -g vercel`, then run `vercel` inside this folder (framework: Other, no build command, output dir: `.`).
- Or push to GitHub and import the repo as a new Vercel project.
Each app is its own Vercel project, so this does not affect your other two.

## Test locally
`npx serve .` then open the shown address on your PC. For a phone, use the deployed https link (the camera needs https).

## Adding the model
1. Train a classifier on your note photos, plus a "background" class (no note).
2. Export to TensorFlow.js format and put `model.json` and its `.bin` files in `model/`.
3. Edit `model/labels.json`: class order must match training; set `inputSize` and `normalize` ("0to1" or "neg1to1").
Without a model the app runs in demo mode.

## Audio
Optional Lao recordings in `audio/` (see README there). Missing files fall back to the phone voice.

## iPhone notes
Open in Safari, Share, Add to Home Screen. Vibration is not supported on iPhone Safari.
