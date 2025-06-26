# 🤖 AI Form Filler - Chrome Extension

Tired of manually filling out web forms? **AI Form Filler** is a Chrome extension that leverages the power of Google's Gemini AI to intelligently complete forms for you based on text, voice, or even image input!

_(A visual demonstration of the extension in action would typically be here.)_

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

## 🛠️ Installation & Setup (For Developers/Testers)

This extension is currently set up for local development and testing:

1.  **Get the Code:**
    -   Clone or download this repository to your local machine.
2.  **Enable Developer Mode in Chrome:**
    -   Open Chrome and navigate to `chrome://extensions`.
    -   Toggle on "Developer mode" in the top right corner.
3.  **Load the Extension:**
    -   Click the "Load unpacked" button.
    -   Select the directory containing the extension's files.
4.  **Gemini API Key Configuration:**
    -   You will need a Google Generative AI (Gemini) API key. Obtain one from [Google AI Studio](https://aistudio.google.com/app/apikey).
    -   In the `background.js` file, locate the `GEMINI_API_KEY` constant and replace the placeholder value with your actual API key.
    -   **🚨 IMPORTANT SECURITY NOTE FOR DEVELOPERS:** The current method of storing the API key directly in `background.js` is **for local development only**. For a publicly distributed extension, implement a secure method for users to provide and store their API key (e.g., using `chrome.storage.local` after prompting the user). **Do not commit your personal API key to a public repository.**
5.  **Usage:** Once loaded, the AI Form Filler icon will appear in your Chrome toolbar.

## 💡 Usage Guide

1.  Navigate to a webpage containing a form.
2.  Click the **AI Form Filler extension icon** to open its popup.
3.  **(Optional but Recommended for Precision):**
    -   Click "Select Form on Page" in the popup.
    -   On the webpage, click the form you wish to target. All available forms will be lightly highlighted during this process.
    -   The chosen form's ID will be displayed in the popup.
4.  **Provide Your Input:**
    -   **Text:** Enter instructions in the "Your Request" field.
    -   **Voice:** Use the "Start/Stop Recording" button.
    -   **Image:** Use the "Upload Image" button.
5.  Click **"Process with AI"**.
6.  The extension will display the AI's response and attempt to fill the designated form on the page.

## 💻 Tech Stack

-   JavaScript (ES6+)
-   HTML5 & CSS3
-   Chrome Extension APIs (Manifest V3)
-   Google Gemini API

## 🌱 Future Development

This project is actively being developed. Potential future enhancements include:

-   Field-level previews before filling.
-   An "undo" feature for the last fill operation.
-   Secure and user-friendly API key management.
-   Options for saving and reusing common input data.
-   Broader compatibility with complex web pages (e.g., those using iFrames or Shadow DOMs).

## 🙌 Contributing

Contributions are welcome! If you're interested in improving AI Form Filler:

1.  Fork the repository.
2.  Create a new branch for your feature or bug fix.
3.  Make your changes and commit them with clear messages.
4.  Push your branch and open a Pull Request.

Please ensure your code adheres to the existing style and includes comments where appropriate.

## 📄 License

This project is released under the MIT License. See the `LICENSE.md` file for more details.

---

**Key changes made for this "production-ready" version:**

-   **Removed direct action items for _you_:** Phrases like "Replace this" are gone.
-   **Generic Screenshot Placeholder:** Instead of a broken image link, it just mentions a visual would be there. You can add this later.
-   **API Key Section for Developers:** Framed the API key part as instructions for _other developers or testers_ setting it up locally, and emphasized the security note for public distribution.
-   **License:** Assumed MIT and mentioned a `LICENSE.md` file (which you should create with the MIT license text).
-   **Future Development/Contributing:** Kept these sections as they are standard and good for an open-source project.

This version should be good to go for an initial commit to GitHub. You can then iteratively improve it by adding the screenshot, clarifying license, etc.
