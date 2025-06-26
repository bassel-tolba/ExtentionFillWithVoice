// Listen for messages from the extension (background.js or popup.js)

let isFormSelectionModeActive = false;
let originalBodyCursor = "";
const FORM_SELECTOR_PERMANENT_HIGHLIGHT_CLASS = "ai-form-filler-permanent-highlight";
const FORM_SELECTOR_POTENTIAL_HIGHLIGHT_CLASS = "ai-form-filler-potential-highlight";
const FORM_SELECTOR_ALL_FORMS_HIGHLIGHT_CLASS = "ai-form-filler-all-selectable-highlight"; // NEW CLASS
let lastPotentialForm = null;
let permanentlyHighlightedForm = null;

// Inject CSS for highlighting
const highlightStyles = `
  body.ai-form-selecting {
    cursor: crosshair !important;
  }
  /* NEW: Highlight for all selectable forms during selection mode */
  .${FORM_SELECTOR_ALL_FORMS_HIGHLIGHT_CLASS} {
    outline: 1px solid #007bff !important; /* Blue, subtle outline */
    box-shadow: 0 0 5px rgba(0, 123, 255, 0.3) !important;
    background-color: rgba(0, 123, 255, 0.05) !important; /* Very light blue background */
    transition: outline 0.1s ease-in-out, background-color 0.1s ease-in-out, box-shadow 0.1s ease-in-out;
  }
  .${FORM_SELECTOR_POTENTIAL_HIGHLIGHT_CLASS} {
    outline: 2px dotted #ffc107 !important; /* Yellow dotted for potential (mouseover) */
    background-color: rgba(255, 193, 7, 0.15) !important; /* Slightly more noticeable */
    box-shadow: 0 0 8px rgba(255, 193, 7, 0.6) !important;
    /* Ensure transition is present here too if not inheriting */
  }
  .${FORM_SELECTOR_PERMANENT_HIGHLIGHT_CLASS} {
    outline: 3px dashed #28a745 !important; /* Green dashed for selected */
    box-shadow: 0 0 15px rgba(40, 167, 69, 0.7) !important;
    background-color: rgba(40, 167, 69, 0.15) !important; /* Slightly more noticeable */
  }
`;
const styleSheet = document.createElement("style");
styleSheet.innerText = highlightStyles;
document.head.appendChild(styleSheet);

function findParentForm(element) {
	let current = element;
	while (current) {
		if (current.tagName === "FORM" && current.hasAttribute("data-ai-form-id")) {
			return current;
		}
		current = current.parentElement;
	}
	return null;
}

function handlePageClickForFormSelection(event) {
	if (!isFormSelectionModeActive) return;

	event.preventDefault();
	event.stopPropagation();

	const targetElement = event.target;
	const formElement = findParentForm(targetElement);

	// Clear previous permanent highlight if one exists
	if (permanentlyHighlightedForm) {
		permanentlyHighlightedForm.classList.remove(FORM_SELECTOR_PERMANENT_HIGHLIGHT_CLASS);
		// It might also have the all-selectable highlight, that will be removed when mode stops
		permanentlyHighlightedForm = null;
	}
	// Clear current potential highlight as a click is happening
	if (lastPotentialForm) {
		lastPotentialForm.classList.remove(FORM_SELECTOR_POTENTIAL_HIGHLIGHT_CLASS);
		lastPotentialForm = null;
	}

	if (formElement) {
		const formId = formElement.getAttribute("data-ai-form-id");
		console.log("CONTENT: Form selected by click:", formId, formElement);
		formElement.classList.add(FORM_SELECTOR_PERMANENT_HIGHLIGHT_CLASS);
		permanentlyHighlightedForm = formElement;
		chrome.runtime.sendMessage({ action: "formSelectedByContentScript", formId: formId });
	} else {
		console.log("CONTENT: No form found for clicked element:", targetElement);
		chrome.runtime.sendMessage({ action: "formSelectedByContentScript", formId: null });
	}
	stopFormSelectionMode(false); // Selection attempt made, don't send explicit cancellation
}

function handlePageMousemoveForFormSelection(event) {
	if (!isFormSelectionModeActive) return;

	const targetElement = event.target;
	const formElement = findParentForm(targetElement);

	if (lastPotentialForm && lastPotentialForm !== formElement) {
		lastPotentialForm.classList.remove(FORM_SELECTOR_POTENTIAL_HIGHLIGHT_CLASS);
	}

	if (formElement && formElement !== lastPotentialForm && formElement !== permanentlyHighlightedForm) {
		// Only add potential highlight if it's one of the generally highlighted forms
		if (formElement.classList.contains(FORM_SELECTOR_ALL_FORMS_HIGHLIGHT_CLASS)) {
			formElement.classList.add(FORM_SELECTOR_POTENTIAL_HIGHLIGHT_CLASS);
			lastPotentialForm = formElement;
		}
	} else if (!formElement && lastPotentialForm) {
		lastPotentialForm.classList.remove(FORM_SELECTOR_POTENTIAL_HIGHLIGHT_CLASS);
		lastPotentialForm = null;
	}
}

function handleEscapeKey(event) {
	if (isFormSelectionModeActive && event.key === "Escape") {
		console.log("CONTENT: Form selection cancelled by Escape key.");
		event.preventDefault();
		event.stopPropagation();
		stopFormSelectionMode(true); // Send cancellation message
	}
}

function startFormSelectionMode() {
	if (isFormSelectionModeActive) return;
	isFormSelectionModeActive = true;

	// Ensure forms are tagged with data-ai-form-id
	const formsOnPage = document.querySelectorAll("form");
	let formsTaggedNow = 0;
	formsOnPage.forEach((form, index) => {
		if (!form.hasAttribute("data-ai-form-id")) {
			form.setAttribute("data-ai-form-id", `form-${index}`);
			formsTaggedNow++;
		}
		// NEW: Add highlight to all forms
		form.classList.add(FORM_SELECTOR_ALL_FORMS_HIGHLIGHT_CLASS);
	});
	if (formsTaggedNow > 0) console.log(`CONTENT: Tagged ${formsTaggedNow} new forms with data-ai-form-id during selection mode start.`);
	console.log(`CONTENT: Applied general highlight to ${formsOnPage.length} forms.`);

	originalBodyCursor = document.body.style.cursor;
	document.body.classList.add("ai-form-selecting");
	document.addEventListener("click", handlePageClickForFormSelection, { capture: true, once: false });
	document.addEventListener("mousemove", handlePageMousemoveForFormSelection, { capture: true });
	document.addEventListener("keydown", handleEscapeKey, { capture: true });
	console.log("CONTENT: Form selection mode STARTED.");
}

function stopFormSelectionMode(sendCancellationMessage = false) {
	if (!isFormSelectionModeActive) return;
	isFormSelectionModeActive = false;

	document.body.style.cursor = originalBodyCursor;
	document.body.classList.remove("ai-form-selecting");
	document.removeEventListener("click", handlePageClickForFormSelection, { capture: true });
	document.removeEventListener("mousemove", handlePageMousemoveForFormSelection, { capture: true });
	document.removeEventListener("keydown", handleEscapeKey, { capture: true });

	// NEW: Remove highlight from all forms
	const allForms = document.querySelectorAll(`form.${FORM_SELECTOR_ALL_FORMS_HIGHLIGHT_CLASS}`);
	allForms.forEach((form) => {
		form.classList.remove(FORM_SELECTOR_ALL_FORMS_HIGHLIGHT_CLASS);
	});
	console.log(`CONTENT: Removed general highlight from ${allForms.length} forms.`);

	if (lastPotentialForm) {
		lastPotentialForm.classList.remove(FORM_SELECTOR_POTENTIAL_HIGHLIGHT_CLASS);
		lastPotentialForm = null;
	}
	// The permanent highlight on `permanentlyHighlightedForm` remains until explicitly cleared elsewhere (e.g., new selection or extractForms)

	if (sendCancellationMessage) {
		chrome.runtime.sendMessage({ action: "formSelectionCancelledByContentScript" });
	}
	console.log("CONTENT: Form selection mode STOPPED.");
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === "extractForms") {
		// Clear any existing permanent highlight AND all-selectable highlights
		// because form indices might change.
		if (permanentlyHighlightedForm) {
			permanentlyHighlightedForm.classList.remove(FORM_SELECTOR_PERMANENT_HIGHLIGHT_CLASS);
			permanentlyHighlightedForm = null;
		}
		const allHighlightedForms = document.querySelectorAll(`.${FORM_SELECTOR_ALL_FORMS_HIGHLIGHT_CLASS}`);
		allHighlightedForms.forEach((f) => f.classList.remove(FORM_SELECTOR_ALL_FORMS_HIGHLIGHT_CLASS));

		const forms = document.querySelectorAll("form");
		const allFormsData = [];

		forms.forEach((form, index) => {
			const uniqueId = `form-${index}`;
			form.setAttribute("data-ai-form-id", uniqueId); // This is key

			const formData = {
				uniqueId: uniqueId,
				action: form.getAttribute("action"),
				method: form.getAttribute("method"),
				fields: [],
			};

			const formElements = form.querySelectorAll("input, select, textarea");

			formElements.forEach((element) => {
				const field = {
					tagName: element.tagName.toUpperCase(),
					type: element.type,
					name: element.name,
					id: element.id,
					value: element.value,
					placeholder: element.placeholder,
				};

				if (element.type === "checkbox" || element.type === "radio") {
					field.checked = element.checked;
				}

				if (element.tagName.toUpperCase() === "SELECT") {
					field.options = Array.from(element.options).map((option) => ({
						text: option.text,
						value: option.value,
						selected: option.selected,
					}));
				}
				formData.fields.push(field);
			});
			allFormsData.push(formData);
		});

		sendResponse(allFormsData);
		return true;
	}

	if (request.action === "fillForm") {
		console.log("--- AI FORM FILLER: STARTING FILL PROCESS ---");
		console.log("Received data:", request.data);

		const { formId, fieldsToFill } = request.data;

		if (!formId || !Array.isArray(fieldsToFill)) {
			console.error("AI FORM FILLER: Received invalid data for filling:", request.data);
			sendResponse({ status: "error", message: "Invalid data structure." });
			return true;
		}

		console.log(`Attempting to find target form with selector: [data-ai-form-id="${formId}"]`);
		const targetForm = document.querySelector(`[data-ai-form-id="${formId}"]`);

		if (!targetForm) {
			console.error(`AI FORM FILLER: FAILURE - Could not find form with ID: ${formId}`);
			sendResponse({ status: "error", message: `Form with ID ${formId} not found.` });
			return true;
		}

		console.log("AI FORM FILLER: SUCCESS - Found target form:", targetForm);

		let fieldsFilled = 0;
		fieldsToFill.forEach((field) => {
			const { fieldName, fieldValue } = field;
			console.log(`-> Processing field: [Name: "${fieldName}", Value: "${fieldValue}"]`);
			let element = targetForm.querySelector(`[name="${fieldName}"]`) || targetForm.querySelector(`#${fieldName}`);

			if (element) {
				console.log(`   SUCCESS: Found element for "${fieldName}":`, element);
				switch (element.type) {
					case "checkbox":
						element.checked = !!fieldValue;
						break;
					case "radio":
						const radioToSelect = targetForm.querySelector(`input[type="radio"][name="${fieldName}"][value="${String(fieldValue)}"]`);
						if (radioToSelect) {
							radioToSelect.checked = true;
							element = radioToSelect;
						} else {
							console.warn(`   Radio value "${fieldValue}" not found for name "${fieldName}"`);
						}
						break;
					default:
						element.value = fieldValue;
						break;
				}
				element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
				element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
				fieldsFilled++;
			} else {
				console.warn(`   FAILURE: Could not find element with name or id of "${fieldName}" inside form #${formId}.`);
			}
		});

		console.log(`--- AI FORM FILLER: FINISHED. Filled ${fieldsFilled} fields. ---`);
		sendResponse({ status: "success", fieldsFilled: fieldsFilled });
		return true;
	}

	if (request.action === "startFormSelectionMode") {
		startFormSelectionMode();
		sendResponse({ status: "listening" });
		return true;
	} else if (request.action === "cancelFormSelectionMode") {
		stopFormSelectionMode(true);
		sendResponse({ status: "cancelled" });
		return true;
	}
});
