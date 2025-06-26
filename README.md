# 🤖 AI Form Filler - Chrome Extension

Tired of manually filling out web forms? **AI Form Filler** is a Chrome extension that leverages the power of Google's Gemini AI to intelligently complete forms for you based on text, voice, or even image input!

![AI Form Filler In Action](placeholder_your_cool_screenshot_or_gif_here.gif)
_(Pro-tip: Replace the placeholder above with an actual screenshot or GIF of your extension in action!)_

## ✨ Features

-   **Multi-Modal Input:**
    -   📝 **Text:** Type your instructions (e.g., "Fill login with user test, pass 123").
    -   🎙️ **Voice:** Speak your form-filling commands directly.
    -   🖼️ **Image:** Upload an image (like a picture of a filled paper form or a data table), and let the AI extract and fill.
-   **Smart Form Selection:**
    -   🎯 **Click-to-Select:** Don't want the AI to guess? Click the "Select Form on Page" button and then click _on or near_ the form you want to target.
    -   👀 **Visual Feedback:** Active form selection mode highlights all detectable forms, and your chosen form gets a special highlight.
-   **AI-Powered Filling:**
    -   🧠 Uses Google's Gemini AI (specifically `gemini-2.5-flash` model via API) for understanding context and extracting data.
    -   🔍 Intelligently matches extracted/provided data to the correct form fields.
-   **Contextual Understanding:** Provides the AI with the structure of all forms on the page and your specific input to make informed decisions.
-   **User-Friendly Popup:** Clean interface to manage inputs, select forms, and view AI responses.

## 🚀 How It Works (The Gist)

1.  **Input:** You provide information via text, voice recording, an uploaded image, or by selecting a specific form on the page.
2.  **Extraction:** The extension identifies all HTML `<form>` elements on the active webpage and notes their structure.
3.  **AI Magic:** Your input and the forms' structures are sent to the Gemini AI API.
4.  **Structured Response:** Gemini analyzes everything and returns a JSON object specifying which form to target (or confirms your selection) and which fields to fill with what values.
5.  **Auto-Fill:** The extension then takes this JSON and populates the identified form fields on the webpage.

## 🛠️ Installation & Setup

As this is a local development version:

1.  **Clone or Download:**
    -   Clone this repository: `git clone https://github.com/your-username/ai-form-filler.git`
    -   Or, download the ZIP and extract it.
2.  **Enable Developer Mode in Chrome:**
    -   Open Chrome and navigate to `chrome://extensions`.
    -   Toggle on "Developer mode" in the top right corner.
3.  **Load the Extension:**
    -   Click the "Load unpacked" button.
    -   Select the directory where you cloned or extracted the project files.
4.  **Get Your Gemini API Key:**
    -   You'll need an API key for Google's Generative AI (Gemini). You can get one from [Google AI Studio](https://aistudio.google.com/app/apikey).
5.  **Configure API Key:**
    -   Open the `background.js` file in the extension's directory.
    -   Find the line: `const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY";` (or similar, it might have a placeholder key already).
    -   Replace `"YOUR_GEMINI_API_KEY"` with your actual, valid Gemini API key.
    -   **🚨 IMPORTANT SECURITY NOTE:** Do **NOT** commit your actual API key to a public GitHub repository. This line is for local development. For a production extension, you'd use a more secure method like `chrome.storage` or a backend proxy.
6.  **Ready to Go!** The AI Form Filler icon should appear in your Chrome toolbar.

## 💡 Usage

1.  Navigate to a webpage with a form you want to fill.
2.  Click the **AI Form Filler extension icon** in your Chrome toolbar to open the popup.
3.  **(Optional but Recommended for Precision):**
    -   Click the "Select Form on Page" button. The popup will indicate you're in selection mode.
    -   Switch to the webpage and click on (or near) the specific form you want the AI to focus on. All detectable forms will be lightly highlighted, and your mouse-over target will get a more prominent highlight.
    -   The selected form's ID will appear in the popup.
4.  **Provide Your Input:**
    -   **Text:** Type your instructions in the "Your Request" textarea.
    -   **Voice:** Click "Start Recording," speak your instructions, then "Stop Recording." An audio player will appear.
    -   **Image:** Click "Upload Image," select an image file. A preview will appear.
5.  Click the **"Process with AI"** button.
6.  The extension will show the AI's JSON response and attempt to fill the form on the page. You'll also see a list of all forms it found for context.

## 🔧 Configuration

The primary configuration needed is your **Gemini API Key**, as described in the Setup section (in `background.js`).

## 💻 Tech Stack

-   JavaScript (ES6+)
-   HTML5 & CSS3
-   Chrome Extension APIs (Manifest V3)
-   Google Gemini API

## 🌱 Future Ideas & Potential Improvements

This project has a lot of room to grow! Some ideas include:

-   **Field-Level Preview & Confirmation:** Visually highlight fields _before_ filling, allowing user confirmation.
-   **"Undo" Last Fill:** A crucial safety net.
-   **Secure API Key Storage:** Moving away from hardcoding for real-world use.
-   **Saved Input Templates:** Quickly fill forms with pre-saved common data (e.g., login, address).
-   **Enhanced Error Handling & Feedback:** More descriptive messages.
-   **Support for iFrames & Shadow DOMs.**
-   **Context Menu Integration.**

## 🙌 Contributing

Contributions, issues, and feature requests are welcome! If you're looking to contribute:

1.  Fork the Project.
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the Branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

Please try to follow existing code style and add comments where necessary. Let's make form-filling less of a chore!

## 📄 License

This project is likely to be under the MIT License (or choose your preferred open-source license).
`LICENSE.md` (You'll want to add this file with the actual license text).

---

**Remember to:**

1.  **Replace `placeholder_your_cool_screenshot_or_gif_here.gif`** with an actual visual. This is super important for GitHub projects!
2.  **Replace `https://github.com/your-username/ai-form-filler.git`** with your actual repository URL.
3.  **Add a `LICENSE.md` file** (e.g., with the MIT License text if you choose that).
4.  Review the "Future Ideas" and customize it if you have other specific plans.

This README aims to be comprehensive, inviting, and clear. Good luck with your project!
