import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const script = readFileSync("app.js", "utf8");
const styles = readFileSync("styles.css", "utf8");

function functionSource(name) {
  const start = script.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Expected app.js to define ${name}()`);
  const next = script.indexOf("\nfunction ", start + 1);
  return script.slice(start, next === -1 ? script.length : next);
}

const stepOneStart = html.indexOf('<section class="form-step active merged-start-step" data-form-step="1"');
const stepTwoStart = html.indexOf('<section class="form-step" data-form-step="2"');
const stepThreeStart = html.indexOf('<section class="form-step" data-form-step="3"');
assert.notEqual(stepOneStart, -1, "Trip Basics must use the merged branded start screen");
assert.ok(stepTwoStart > stepOneStart, "The merged Trip Basics screen must precede Adventure");
assert.ok(stepThreeStart > stepTwoStart, "Adventure must precede Travel style");
const stepOneHtml = html.slice(stepOneStart, stepTwoStart);
const stepTwoHtml = html.slice(stepTwoStart, stepThreeStart);

assert.match(stepOneHtml, /class="builder-brand home-brand-lockup"[\s\S]*?src="adtona-logo\.png"/, "The merged first screen must show the Adtona logo");
assert.match(stepOneHtml, /<p class="eyebrow">Free AI travel planner<\/p>/, "Trip Basics must state the product category");
assert.match(stepOneHtml, /<h1>Plan the trip\. Build the guide\. Go Now\.<\/h1>/, "Trip Basics must use the Adtona primary tagline as its page heading");
assert.match(stepOneHtml, /Create a shareable trip website, printable day-by-day itinerary, and AI-ready planning file—free in your browser\./, "Trip Basics must state the approved public promise");
// The welcome screen keeps only the tagline and the one-line promise. The refinement and
// no-account lines are not repeated as an intro in Learn More either — its body already
// covers both, so the dialog opens straight into its sections.
assert.doesNotMatch(stepOneHtml, /export a guide you can refine with ChatGPT/, "Trip Basics must stay uncluttered");
assert.doesNotMatch(stepOneHtml, /No account or API key needed/, "The no-account detail belongs in Learn More, not the welcome screen");
const learnMoreHtml = html.slice(html.indexOf('id="learnMoreDialog"'));
// Those lines are no longer repeated as an intro in Learn More either: its body already
// covers the formats, the AI loop and the no-account promise, so the dialog opens straight
// into its sections rather than restating them.
assert.doesNotMatch(learnMoreHtml, /<p class="landing-lede">/, "Learn More must not repeat the promise as a duplicate intro");
assert.match(learnMoreHtml, /AI-ready planning file/, "Learn More must still describe the AI-ready planning file in its body");
assert.match(html, /data-open-learn-more>Learn More<\/button>(?!\.)/, "The Learn More link must not end in a period");
assert.match(html, /No account needed\. Your draft stays in this browser\./, "The footer must still carry the browser-local promise");
assert.match(stepOneHtml, /<label class="sr-only" for="destination">Destination<\/label>/, "The destination control must retain an accessible label");
assert.doesNotMatch(stepOneHtml, />Where\?</, "The compact first screen must not show a redundant Where heading");
assert.doesNotMatch(stepOneHtml, />When\?</, "The compact first screen must not show a redundant When heading");
assert.match(stepOneHtml, /<label for="startDate">Arrive<\/label>[\s\S]*?id="startDate"[\s\S]*?<label for="endDate">Depart<\/label>[\s\S]*?id="endDate"/, "Arrival and departure inputs must retain their individual labels");
assert.match(script, /destinationInput\.value\s*=\s*"";/, "A new browser draft must start with a blank destination");
assert.doesNotMatch(script, /destinationInput\.value\s*=\s*"Tokyo, Japan";/, "The destination field must no longer be prefilled with Tokyo, Japan");
assert.match(stepOneHtml, /data-open-import[\s\S]{0,180}?Import AI Plan/, "The first screen must provide a compact AI-plan importer");
assert.match(stepOneHtml, /id="nextStepButton"[^>]*type="button"[\s\S]{0,180}?Go Now/, "The merged first screen must use the approved primary CTA");
assert.match(
  script,
  /form\.addEventListener\("submit"[\s\S]{0,500}?currentFormStep === 1[\s\S]{0,220}?await goToPreferencesStep\(\);[\s\S]{0,80}?return;/,
  "Pressing Enter on Trip Basics must advance to Adventure instead of creating the final website"
);
assert.match(
  script,
  /\[destinationInput, startDateInput, endDateInput\]\.forEach[\s\S]{0,360}?event\.key !== "Enter"[\s\S]{0,220}?event\.preventDefault\(\);[\s\S]{0,100}?goToPreferencesStep\(\);/,
  "Every Trip Basics field must explicitly map the desktop Enter key to the Adventure transition"
);
assert.match(
  script,
  /if \(currentFormStep !== 4\) return;[\s\S]{0,260}?questionPosition\[4\] < constraintQuestions\.length - 1[\s\S]{0,180}?showStepQuestion\(4, questionPosition\[4\] \+ 1\)/,
  "Implicit form submission must not create a website before the final Constraints question"
);
assert.doesNotMatch(html, /id="startSplash(?:Continue)?"/, "Trip Basics must not be hidden behind a separate splash layer");
assert.match(script, /function showStartSplash\(/, "Refresh and workflow restarts must have an explicit merged-start lifecycle");
assert.doesNotMatch(script, /function dismissStartSplash\(/, "The merged first screen must not auto-dismiss while the traveler is typing");
assert.match(styles, /\.trip-form\[data-current-step="1"\][\s\S]{0,900}?linear-gradient\(150deg,\s*#fff4d6/, "Trip Basics must retain the branded startup background");
assert.match(styles, /\.builder:not\(\.builder-wide\) \.merged-start-layout\s*\{[^}]*grid-template-rows:\s*minmax\(24px,\s*\.65fr\)\s+auto\s+minmax\(64px,\s*1fr\)\s+auto/s, "The welcome screen must balance flexible space above and below the brand");
assert.match(styles, /\.builder:not\(\.builder-wide\) \.merged-start-step \.builder-hero-lockup\s*\{[^}]*grid-row:\s*2/s, "The welcome brand must occupy the centered second grid row");
assert.match(styles, /\.builder:not\(\.builder-wide\) \.merged-start-step \.home-brand-lockup \.home-brand-logo\s*\{[^}]*width:\s*clamp\(320px,\s*32vw,\s*520px\)/s, "The desktop welcome logo must use the enlarged responsive lockup");
assert.match(styles, /\.builder:not\(\.builder-wide\) \.merged-start-step \.builder-hero-message \.eyebrow\s*\{[^}]*font-size:\s*clamp\(15px,\s*1\.6vw,\s*23px\)/s, "The welcome tagline must be enlarged for readability");
assert.match(styles, /\.builder:not\(\.builder-wide\) \.merged-start-questions\s*\{[^}]*grid-row:\s*4[^}]*align-self:\s*end/s, "Destination and date controls must sit immediately above the bottom action row");
assert.match(styles, /\.builder:not\(\.builder-wide\) \.merged-start-actions\s*\{[^}]*margin-top:\s*0/s, "The welcome actions must remain aligned directly beneath the trip controls");
assert.match(styles, /prefers-reduced-motion:\s*reduce/, "The v4 animations must honor reduced-motion preferences");
assert.match(script, /Live research catalog created from keyless public sources\. Verify before travel\./, "The live-research reminder must use the compact verification copy");
assert.match(styles, /\.builder \.style-question\s*\{[^}]*align-content:\s*start[^}]*grid-auto-rows:\s*max-content/s, "Wizard cards must pack their labels, helper copy, and controls without stretched grid-track whitespace");
assert.match(styles, /\.builder \.style-question select,[\s\S]{0,320}?\.style-question select\s*\{[^}]*min-height:\s*40px[^}]*height:\s*40px[^}]*max-height:\s*40px[^}]*align-self:\s*start/s, "All wizard dropdowns must use the same compact 40px field height");
assert.match(styles, /\.trip-header-actions \.export-button\s*\{[^}]*display:\s*inline-flex[^}]*align-items:\s*center[^}]*justify-content:\s*center[^}]*text-align:\s*center[^}]*line-height:\s*1/s, "Feedback, Export, and Edit trip must share centered header-button alignment");

assert.match(script, /function renderSuggestionDeckCard\(/, "Adventure recommendations must render as a one-card deck");
assert.match(script, /function applySuggestionDecision\(/, "The deck must apply Skip, Include, and Favorite decisions through shared state");
assert.match(script, /function undoSuggestionDecision\(/, "The deck must support redo/rewind");
assert.match(stepTwoHtml, /class="suggestion-heading-row"[\s\S]{0,400}?id="adventureStepTitle"[\s\S]{0,400}?id="surpriseMeButton"[^>]*>Not sure where to begin\? Choose for me<\/button>/, "Adventure must present one concise auto-pick button beside its heading");
assert.match(script, /const rejectedSuggestions = new Map\(\)/, "Skipped recommendations must have explicit exclusion state");
assert.match(script, /\[\.\.\.selections, \.\.\.rejectedSelections\]\.map\(recommendationKey\)/, "Automatic itinerary backfill must honor skipped recommendations");
assert.match(script, /rejectedSuggestions\.set\(key, suggestion\)/, "A left decision must record the recommendation as rejected");
assert.match(script, /rejectedValueBefore\s*=\s*rejectedSuggestions\.get\(key\)/, "History must preserve the exact prior rejection value");
assert.match(script, /previous\.rejectedValueBefore[\s\S]{0,100}?rejectedSuggestions\.set\(previous\.key, previous\.rejectedValueBefore\)/, "Redo must restore the exact prior rejection value");
assert.match(script, /rejectedSelections, preferences/, "Saved drafts must retain skipped recommendations");
assert.match(script, /form\.reset\(\);[\s\S]{0,180}?resetSuggestionDeckState\(\);/, "New Trip must reset deck review history");
assert.match(script, /addEventListener\("pointerdown"/, "The deck must support pointer and touch swipes");
assert.match(script, /event\.key === "ArrowRight"/, "The deck must support keyboard inclusion");
assert.match(script, /event\.key !== "ArrowLeft"/, "The deck must support keyboard skipping");
assert.match(styles, /\.suggestion-swipe-card[\s\S]*?touch-action:\s*pan-y/, "The swipe card must preserve vertical page gestures");
assert.match(script, /loading="eager" draggable="false"/, "Card images must not intercept desktop swipe gestures");
assert.match(script, /SUGGESTION_DECISION_SWIPE_HOLD_MS\s*=\s*0/, "Committed card swipes must continue off-screen without a decision-label pause");
assert.doesNotMatch(script, /suggestion-swipe-deck" role="region" aria-live=/, "Only the concise deck status should be announced as a live region");
assert.match(styles, /\.builder\s+\.form-step\[hidden\]\s*\{[^}]*display:\s*none\s*!important/s, "Inactive workflow steps must never paint behind the Adventure deck");
assert.match(html, /id="backStepButton"/, "Adventure Back navigation must remain available");
assert.match(html, /id="detailsStepButton"/, "Adventure Next navigation must remain available");
assert.ok(
  stepTwoHtml.indexOf('class="suggestion-toolbar"') < stepTwoHtml.indexOf('id="suggestionBoard"'),
  "The compact auto-pick helper must appear above the photo and description deck"
);

const renderDeckSource = functionSource("renderSuggestionDeckCard");
const showBuilderSource = functionSource("showBuilder");
const showStartSplashSource = functionSource("showStartSplash");
const restoreSavedTripSource = functionSource("restoreSavedTrip");
const applyDecisionSource = functionSource("applySuggestionDecision");
const distributeSelectionsSource = functionSource("distributeTripSelections");
const createActivitiesSource = functionSource("createActivities");
const activityFactorySource = functionSource("activity");
const activitySelectionStateSource = functionSource("activitySelectionState");
const renderActivitySource = functionSource("renderActivity");
const uniqueActivitiesSource = functionSource("makeActivitiesUnique");

assert.match(script, /renderKnownDestinationOptions\(\);\s*showStartSplash\(\);/, "Every page load must show the opening title, even when a trip is saved");
assert.doesNotMatch(script, /if\s*\(\s*!hasSavedTripAtLoad\(\)\s*\)\s*showStartSplash\(\)/, "Saved trips must not bypass the opening title");
assert.match(showStartSplashSource, /result\.hidden\s*=\s*true[\s\S]*builder\.hidden\s*=\s*false[\s\S]*showFormStep\(1\)[\s\S]*merged-start-reveal/, "The title lifecycle must reveal the merged Trip Basics screen");
assert.doesNotMatch(showStartSplashSource, /setTimeout\(|START_SPLASH_DURATION|dismissStartSplash/, "The merged Trip Basics screen must wait for the traveler's explicit continue action");
assert.match(showBuilderSource, /options\.splash[\s\S]*showStartSplash/, "Workflow restarts must be able to replay the title");
assert.match(script, /#editTripButton"\)\.addEventListener\("click",\s*\(\)\s*=>\s*showBuilder\(\{\s*splash:\s*true\s*\}\)\)/, "Edit Trip must restart through the title page");
assert.match(script, /#newTripButton"\)[\s\S]{0,900}?showBuilder\(\{\s*splash:\s*true,\s*focusDestination:\s*true\s*\}\)/, "New Trip must restart through the title page after clearing the prior trip");
assert.match(restoreSavedTripSource, /restoreSuggestionState\(selectedSuggestions,\s*trip\.selections\)/, "Imported selections and favorites must survive the splash-first restore");
assert.doesNotMatch(restoreSavedTripSource, /builder\.hidden\s*=\s*true|result\.hidden\s*=\s*false|classList\.add\("trip-mode"\)|renderTrip\(\)|switchAppTab\(/, "Startup restoration must hydrate Trip Basics without reopening the report");
assert.match(script, /activeDay\s*\+\s*\(dx\s*<\s*0\s*\?\s*1\s*:\s*-1\)/, "Swiping left on the generated guide must advance to the next day");
assert.match(script, /currentDay\s*\+\s*\(dx<0\?1:-1\)/, "The standalone export must use the same left-to-next-day swipe mapping");

assert.match(
  renderDeckSource,
  /suggestion-(?:redo|undo)-button[\s\S]{0,1200}?suggestion-skip-button[\s\S]{0,1200}?suggestion-include-button[\s\S]{0,1200}?suggestion-favorite-button/,
  "The action rail must present redo/rewind, skip, include, and favorite in that order"
);
assert.match(renderDeckSource, /(?:Redo|Rewind) last recommendation choice/i, "The left action must be labeled as redo/rewind rather than an ambiguous arrow");
assert.match(renderDeckSource, /suggestion-skip-button[^`]*aria-label="Skip /, "The red X action must retain an accessible Skip label");
assert.match(renderDeckSource, /suggestion-include-button[^`]*aria-label="Include /, "The green heart action must retain an accessible Include label");
assert.match(renderDeckSource, /suggestion-favorite-button[^`]*aria-label="Favorite /, "The star action must retain an accessible Favorite label");

assert.match(renderDeckSource, /suggestion-(?:decision|swipe)-overlay skip[^>]*>[\s\S]{0,120}?SKIP/i, "Each card must include a red Skip decision overlay");
assert.match(renderDeckSource, /suggestion-(?:decision|swipe)-overlay include[^>]*>[\s\S]{0,120}?INCLUDE/i, "Each card must include a green Include decision overlay");
assert.match(styles, /\.suggestion-(?:decision|swipe)-overlay\s*\{[^}]*position:\s*absolute[^}]*pointer-events:\s*none/s, "Decision overlays must sit transparently above the recommendation without intercepting input");
assert.match(styles, /\.suggestion-(?:decision|swipe)-overlay\.skip\s*\{[^}]*?(?:background|--decision-color):/s, "The Skip overlay must define its red treatment");
assert.match(styles, /\.suggestion-(?:decision|swipe)-overlay\.include\s*\{[^}]*?(?:background|--decision-color):/s, "The Include overlay must define its green treatment");
assert.match(styles, /\.show-skip-decision[\s\S]{0,240}?\.skip/, "Button-triggered skips must visibly reveal the Skip overlay before the card exits");
assert.match(styles, /\.show-include-decision[\s\S]{0,240}?\.include/, "Button-triggered includes must visibly reveal the Include overlay before the card exits");
assert.match(script, /--skip-progress/, "Leftward dragging must control only the Skip overlay");
assert.match(script, /--include-progress/, "Rightward dragging must control only the Include overlay");

// Regression guard: the Skip/Include/Favorite/Redo action rail must never be pushed off-screen
// by a growing recommendation card. The deck shell must keep the card row flexible (minmax(0,
// 1fr) so it fills the space *above* the pinned action + hint rows) and the card body must clip
// its content instead of growing or scrolling.
const adventureViewportMarker = "/* Adventure viewport fit.";
const adventureViewportStart = styles.lastIndexOf(adventureViewportMarker);
assert.ok(adventureViewportStart >= 0, "The final Adventure viewport-fit override block must be present");
const adventureViewportStyles = styles.slice(adventureViewportStart);

assert.match(adventureViewportStyles, /\.builder\.builder-wide \.trip-form\[data-current-step="2"\]\s*\{[^}]*grid-template-rows:\s*auto\s+auto\s+auto\s+minmax\(0,\s*1fr\)[^}]*overflow:\s*hidden/s, "Normal-height Adventure screens must contain the complete workflow without page scrolling");
assert.match(adventureViewportStyles, /\[data-form-step="2"\]\.active\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0[^}]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)\s+auto\s+auto\s+auto\s+auto[^}]*overflow:\s*hidden/s, "The active Adventure step must reserve one flexible card row while keeping its summary and navigation in view");
assert.match(adventureViewportStyles, /\.suggestion-swipe-shell\s*\{[^}]*width:\s*min\(100%,\s*780px\)[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+44px\s+auto/s, "Desktop recommendation cards must use the narrower 780px shell with a pinned 44px action rail");
assert.match(styles, /\.suggestion-swipe-card\s+\.suggestion-card-body\s*\{[^}]*overflow:\s*hidden/s, "The recommendation card body must clip its content (overflow: hidden) so it can't grow and push the action rail below the fold");
assert.match(adventureViewportStyles, /\.suggestion-swipe-card\s*,[\s\S]*?\.suggestion-swipe-card\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*7fr\)\s+minmax\(104px,\s*3fr\)/s, "Desktop recommendation cards must devote about 70% of their height to the destination image");
assert.match(adventureViewportStyles, /\.suggestion-card-image\s*,[\s\S]*?\.suggestion-card-image\s*\{[^}]*object-position:\s*center[^}]*transform:\s*none/s, "The viewport-fit card must not scale and over-crop destination images");
assert.match(styles, /\.trip-form\[data-current-step="2"\] \.suggestion-heading-row\s*\{[^}]*display:\s*flex[^}]*justify-content:\s*space-between/s, "The auto-pick helper must stay aligned with the Adventure heading");
assert.match(styles, /@media\s*\(min-width:\s*761px\)[\s\S]*?\.suggestion-swipe-card\s+\.suggestion-card-body\s*\{[^}]*display:\s*grid[^}]*grid-template-rows:\s*auto\s+auto\s+minmax\(0,\s*1fr\)\s+auto/s, "Desktop recommendation text must reserve independent rows for the title, metadata, bounded description, and links");
assert.match(styles, /@media\s*\(min-width:\s*761px\)[\s\S]*?\.suggestion-card-body\s*>\s*\*\s*\{[^}]*grid-column:\s*1/s, "Legacy card-column rules must be reset so desktop recommendation text cannot overlap across implicit columns");
assert.match(styles, /\.suggestion-swipe-card\s+\.suggestion-card-detail\s*\{[^}]*grid-row:\s*3[^}]*overflow:\s*hidden[^}]*-webkit-line-clamp:\s*3/s, "Long recommendation copy must be clipped inside its own third grid row");
assert.match(styles, /\.suggestion-swipe-card\s+\.suggestion-card-links\s*\{[^}]*grid-row:\s*4[^}]*overflow:\s*hidden[^}]*background:\s*#fffdf8/s, "Source and map links must render in a separate protected footer row");
assert.match(styles, /\.suggestion-swipe-card\s+\.suggestion-card-links\s+\.source-credit\s*\{[^}]*margin-top:\s*0/s, "Source attribution and Google Maps verification must share the same baseline");
assert.match(styles, /\.suggestion-card-links\s+a\s*\{[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s, "Long source labels must truncate rather than collide with recommendation copy");
assert.match(adventureViewportStyles, /\.suggestion-swipe-actions \.suggestion-action-button\s*\{[^}]*width:\s*44px[^}]*height:\s*44px[^}]*min-height:\s*44px/s, "Desktop and mobile Redo, Skip, Include, and Favorite controls must preserve a compact 44px touch target");
assert.match(adventureViewportStyles, /\.preference-actions \.icon-nav-button\s*\{[^}]*min-height:\s*40px[^}]*height:\s*40px/s, "Desktop Back and Next navigation must use the compact 40px height");
assert.match(adventureViewportStyles, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.suggestion-swipe-shell\s*\{[^}]*width:\s*min\(100%,\s*480px\)/s, "Mobile recommendation cards must use the narrower 480px shell");
assert.match(adventureViewportStyles, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.suggestion-swipe-card\s*,[\s\S]*?\.suggestion-swipe-card\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*7fr\)\s+minmax\(100px,\s*3fr\)/s, "Mobile recommendations must preserve the image-forward 70/30 split");
assert.match(adventureViewportStyles, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.preference-actions \.icon-nav-button\s*\{[^}]*min-height:\s*44px[^}]*height:\s*44px/s, "Mobile Back and Next navigation must retain a 44px touch target");
assert.match(adventureViewportStyles, /@media\s*\(max-height:\s*560px\)[\s\S]*?\.trip-form\[data-current-step="2"\]\s*\{[^}]*grid-template-rows:\s*auto\s+auto\s+auto\s+auto[^}]*overflow-y:\s*auto/s, "Only unusually short viewports may fall back to scrolling");
assert.match(adventureViewportStyles, /@media\s*\(max-height:\s*560px\)[\s\S]*?\.suggestion-swipe-deck\s*\{[^}]*height:\s*310px[^}]*min-height:\s*310px/s, "The short-height fallback must retain a usable 310px recommendation deck");
assert.doesNotMatch(styles, /grid-template-rows:\s*minmax\(0,\s*38%\)\s+minmax\(0,\s*1fr\)/, "Short phones must not regress to a description-heavy 38% photo");
assert.match(script, /section\.innerHTML[^;]*suggestion-swipe-actions/s, "Every recommendation group must render the action-rail container");

assert.match(applyDecisionSource, /decision\s*===\s*["']favorite["']/, "Favorite must be a first-class deck decision");
assert.match(applyDecisionSource, /favorite\s*:\s*(?:decision\s*===\s*["']favorite["']|true)/, "Favorite decisions must persist priority on the selected suggestion");
assert.match(applyDecisionSource, /selectedValueBefore\s*=\s*selectedSuggestions\.get\(key\)/, "Redo must preserve exact prior selection state, including Favorite");
assert.match(distributeSelectionsSource, /favorite/, "Itinerary distribution must inspect favorite priority");
assert.match(distributeSelectionsSource, /\.sort\(/, "Itinerary distribution must order selected recommendations by priority");
assert.match(createActivitiesSource, /favorite/, "Activity placement must preserve favorite priority within each day");
assert.match(createActivitiesSource, /\.sort\(/, "Favorite activities must be ordered ahead of ordinary selected activities");
assert.match(activityFactorySource, /["']userSelected["'][\s\S]{0,120}?["']favorite["']/, "Generated activities must retain selected and favorite provenance");
assert.match(activitySelectionStateSource, /activity\?\.favorite[\s\S]{0,180}?activity\?\.userSelected/, "Activity badge state must distinguish favorites from ordinary selections");
assert.match(renderActivitySource, /activity-origin-badge/, "Itinerary activities must render a traveler-choice badge beside the title");
assert.match(renderActivitySource, /selectionState\.favorite\s*\?\s*["']★ Favorite["']\s*:\s*["']✓ Selected["']/, "Favorite must replace, not duplicate, the Selected pill");
assert.match(html, /class="activity-title-row"[\s\S]{0,100}?<h4><\/h4>[\s\S]{0,100}?activity-origin-badge/, "The badge must sit beside and outside the editable itinerary title");
assert.match(styles, /\.activity-origin-badge\.is-selected\s*\{[^}]*background:/s, "Selected itinerary pills need a distinct visual treatment");
assert.match(styles, /\.activity-origin-badge\.is-favorite\s*\{[^}]*background:/s, "Favorite itinerary pills need a distinct visual treatment");
assert.match(uniqueActivitiesSource, /item\.userSelected\s*\|\|\s*item\.favorite/, "Duplicate resolution must never replace a traveler-selected or favorite stop");

// The busy deliverable-card arc was removed: the build screen now shows only the enlarged,
// centered logo with the brand line beneath it.
assert.doesNotMatch(html, /class="creation-output-stack"/, "The trip-creation transition must no longer render the deliverable-card arc");
assert.doesNotMatch(html, /class="creation-output-card"/, "The individual build-animation output cards must be removed");
assert.match(html, /class="creation-center-stage"[\s\S]{0,200}?id="tripCreationLogo"[\s\S]{0,260}?trip-creation-brand-line/s, "The build screen must center the logo above the brand line");
assert.match(styles, /\.trip-creation-transition \.creation-center-stage\s*\{\s*top:\s*0/s, "With the cards gone, the logo and copy must sit centered rather than pushed below an arc");
assert.match(styles, /\.trip-creation-transition \.creation-center-stage > img\s*\{[^}]*width:\s*clamp\(160px/s, "The standalone build-animation logo must be enlarged");
assert.match(styles, /\.trip-creation-transition \.creation-center-stage \.trip-creation-brand-line\s*\{[^}]*font-size:\s*clamp\(34px/s, "The build-animation brand line must be enlarged");

const obsoleteZeroSelectionGuard = /if\s*\(\s*!selectedSuggestions\.size\s*&&\s*!wishListInput\.value\.trim\(\)\s*\)/;
assert.doesNotMatch(script, obsoleteZeroSelectionGuard, "Skipping every card must not dead-end the workflow");

console.log("Merged welcome screen and four-action swipe-deck smoke test passed.");

// Steps 3 and 4 ask one question at a time: the continue button names the question it
// leads to, and every question can be skipped. Fields stay in the DOM so the trip builder
// still reads answers given before the traveler moved on.
assert.match(html, /data-form-step="3"[\s\S]*?data-next-question[\s\S]{0,200}?question-next-label/, "Step 3 must offer a continue button that names the next question");
assert.match(html, /data-form-step="4"[\s\S]*?data-next-question[\s\S]{0,200}?question-next-label/, "Step 4 must offer a continue button that names the next question");
assert.equal((html.match(/data-skip-question/g) || []).length, 0, "Guided questions must not duplicate the Next action with a Skip link");
assert.match(script, /function showStepQuestion\(step, index\)/, "One-question-at-a-time navigation must be implemented");
assert.match(script, /label\.textContent = questionTitle\(questions\[position \+ 1\]\)/, "The continue button must be labelled with the following question");
assert.match(styles, /\[data-form-step="3"\] \.style-question,\s*\[data-form-step="4"\] \.style-question\s*\{[^}]*display:\s*none/s, "Only the current question may be visible");
assert.match(styles, /\.style-question\.is-current-question,\s*\[data-form-step="4"\] \.style-question\.is-current-question\s*\{[^}]*display:\s*grid/s, "The current question must be shown");
// The wizard state must be declared before showFormStep runs at start-up, or the const is
// still in its temporal dead zone and the rest of app.js never executes.
assert.ok(
  script.indexOf("const QUESTION_STEPS") < script.indexOf("function showFormStep"),
  "Question-step state must be declared before showFormStep to avoid a start-up TDZ error"
);

// Answering a single-choice question advances on its own, but the multi-select questions
// (food restrictions, must-dos, things to avoid) must not — advancing on the first tap
// would stop the traveler choosing several.
assert.match(script, /if \(cfg\.mode !== "list"\) advanceQuestionAfterChoice\(chip\)/, "Only single-choice quick picks may auto-advance");
assert.match(script, /function advanceQuestionAfterChoice\(origin\)/, "Choosing an answer must advance the question");
assert.match(script, /\.style-question select[\s\S]{0,140}?advanceQuestionAfterChoice\(select\)/, "Choosing from a dropdown must advance the question");
assert.match(
  script,
  /QUESTION_STEPS\.forEach[\s\S]{0,1100}?section\.addEventListener\("keydown"[\s\S]{0,500}?event\.key !== "Enter"[\s\S]{0,500}?showStepQuestion\(step, questionPosition\[step\] \+ 1\)/,
  "Enter in an active Step 3/4 field must activate the visible next-question action"
);
assert.match(
  script,
  /const startingPosition = questionPosition\[step\];[\s\S]{0,320}?questionPosition\[step\] === startingPosition/,
  "Delayed dropdown advancement must not skip a second question after Enter already advanced"
);
// Mobile gestures: left skips ahead, right goes back.
assert.match(script, /function bindQuestionSwipe\(section, step\)/, "The question card must support swipe gestures");
assert.match(script, /if \(deltaX < 0\) showStepQuestion\(step, questionPosition\[step\] \+ 1\);/, "A left swipe must skip to the next question");
assert.match(script, /else showStepQuestion\(step, questionPosition\[step\] - 1\)/, "A right swipe must return to the previous question");
assert.match(styles, /\.style-question\.is-current-question[\s\S]{0,400}?border-radius:\s*22px[\s\S]{0,200}?box-shadow/s, "The question must render as a contained card like the Adventure deck");
assert.match(styles, /v5\.3\.48:[\s\S]*?width:\s*min\(100%,\s*960px\)/, "Guided question cards must use more of the desktop canvas");
assert.match(styles, /v5\.3\.48:[\s\S]*?min-height:\s*clamp\(260px,\s*34vh,\s*360px\)/, "Desktop guided questions must render as a larger card");
assert.match(styles, /v5\.3\.48:[\s\S]*?font-size:\s*clamp\(21px,\s*1\.55vw,\s*27px\)/, "Guided question headings must be comfortably readable");
assert.match(styles, /v5\.3\.48:[\s\S]*?\.quick-pick[\s\S]{0,180}?min-height:\s*42px[\s\S]{0,120}?font-size:\s*14px/, "Desktop guided choice buttons must have generous tap targets and readable labels");
assert.match(styles, /v5\.3\.48:[\s\S]*?wizard-actions\.question-actions[\s\S]{0,900}?min-height:\s*58px[\s\S]{0,120}?font-size:\s*16px/, "Desktop guided navigation buttons must be prominent and readable");
assert.match(styles, /@media \(max-width:\s*760px\)[\s\S]*?min-height:\s*clamp\(290px,\s*43vh,\s*390px\)[\s\S]*?font-size:\s*clamp\(20px,\s*5\.8vw,\s*24px\)/, "Mobile guided questions must retain a large card and readable heading");
assert.match(styles, /@media \(max-width:\s*760px\)[\s\S]*?\.quick-pick[\s\S]{0,180}?min-height:\s*40px[\s\S]{0,120}?font-size:\s*13px/, "Mobile guided choice buttons must remain easy to tap");

// The shared workflow menu must not resize when the active step changes. Steps 3 and 4
// once inherited a 28px marker while Adventure used 22px, making their arrows six pixels
// taller even though the menu contained the same labels.
const unifiedWorkflowNavigationStyles = styles.slice(styles.indexOf("v5.3.51: One navigation geometry"));
assert.match(
  unifiedWorkflowNavigationStyles,
  /data-current-step="2"\] \.form-progress,\s*[\s\S]{0,180}?data-current-step="3"\] \.form-progress,\s*[\s\S]{0,180}?data-current-step="4"\] \.form-progress\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/,
  "Steps 2, 3, and 4 must share one equal-width four-arrow navigation grid"
);
assert.match(
  unifiedWorkflowNavigationStyles,
  /data-current-step="2"\] \.form-progress span b,\s*[\s\S]{0,220}?data-current-step="4"\] \.form-progress span b\s*\{[^}]*width:\s*22px[^}]*height:\s*22px[^}]*flex:\s*0 0 22px/,
  "Desktop workflow markers must use the same 22px geometry on every step"
);
assert.match(
  unifiedWorkflowNavigationStyles,
  /@media \(max-width:\s*760px\)[\s\S]*?data-current-step="2"\] \.form-progress span b,\s*[\s\S]{0,220}?data-current-step="4"\] \.form-progress span b\s*\{[^}]*width:\s*20px[^}]*height:\s*20px[^}]*flex-basis:\s*20px/,
  "Mobile workflow markers must use the same 20px geometry on every step"
);

// Multi-select answers sit on one comma-separated line rather than one per line, so every
// choice stays visible without scrolling inside the box.
assert.match(script, /mustDos:\s*\{ mode: "list", sep: ", "/, "Must-do activities must be comma separated");
assert.match(script, /avoidList:\s*\{ mode: "list", sep: ", "/, "Things to avoid must be comma separated");
// Mobility keeps semicolons: one of its options ("Max ~5,000 steps/day") contains a comma,
// so a comma separator would split that option in half.
assert.match(script, /mobilityNeeds:\s*\{ mode: "list", sep: "; "/, "Mobility needs must keep its semicolon separator");
assert.match(script, /parseList\(trip\.preferences\.mustDos\)/, "The packing list must split must-dos on commas as well as newlines");
assert.match(script, /function autoSizeTextarea\(field\)/, "Multi-select boxes must grow to fit instead of scrolling");
assert.doesNotMatch(html, /placeholder="One per line"/, "The comma-separated questions must not still say one per line");

// Choosing a different destination starts the travel-style and constraints answers fresh,
// so a home base like "Asakusa" cannot follow a traveler from one city into another.
assert.match(script, /function resetTripPreferenceFields\(\)/, "Switching destination must reset the wizard answers");
// The reset is keyed to the destination the answers were given for, and re-checked on every
// entry to Steps 3/4: the quick picks re-render for the new city on entry, so the chips
// followed the traveler while the typed answers did not (Kyoto showing Tokyo's "Shinjuku").
assert.match(script, /let preferenceDestination = ""/, "Answers must record the destination they belong to");
assert.match(script, /function syncPreferencesToDestination\(\)/, "A destination change must be reconciled wherever it happens");
assert.match(
  script,
  /if \(preferenceDestination && preferenceDestination !== current\) resetTripPreferenceFields\(\);/,
  "A different destination must clear the place-specific answers"
);
assert.match(
  script,
  /stepNumber === 3 \|\| stepNumber === 4\) \{\s*syncPreferencesToDestination\(\);/,
  "Entering Travel style or Constraints must reconcile the answers with the destination"
);
assert.match(script, /field\.value = field\.defaultValue/, "Answers must return to the defaults authored in the markup");
assert.match(script, /option\.defaultSelected/, "Dropdowns must return to their authored selected option");

// A day must not be left with hours of dead time (the reported Seattle day ran lunch to
// 14:30 then nothing until a 19:30 dinner), and the category-style must-do quick picks
// must not be scheduled again once the plan already covers them.
assert.match(script, /function fillDaytimeGaps\(day, destination, preferences, seen, zone\)/, "Long empty stretches must be filled with something to do");
assert.match(script, /const MAX_FREE_GAP_MINUTES = 150/, "The acceptable free-time gap must be bounded");
assert.match(script, /fillDaytimeGaps\(day, destination, preferences, seenRecommendations, dayZones\[index\]\)/, "Gap filling must run after scheduling, when real times are known");
assert.match(script, /function genericMustDoIsCovered\(name, itineraryDays\)/, "Generic must-dos must be checked against what the plan already covers");
assert.match(script, /\^local cuisine\$/, "\"Local cuisine\" must count as covered by an Eat stop");

// Arriving at Steps 3/4 walks their questions from the beginning again (answers stay
// filled in); only the Back button resumes the question the traveler was on.
assert.match(script, /function showFormStep\(stepNumber, options = \{\}\)/, "showFormStep must accept navigation options");
assert.match(script, /options\.resumeQuestion \? questionPosition\[stepNumber\] : 0/, "Arriving at a question step must restart it unless resuming");
assert.match(script, /showFormStep\(3, \{ resumeQuestion: true \}\)/, "Back out of Constraints must resume Travel style, not restart it");
// The dropdown questions offer the same bubbles as every other question.
assert.match(script, /function renderSelectBubbles\(select\)/, "Dropdown answers must render as selectable bubbles");
assert.match(script, /select\.dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/, "Choosing a bubble must apply the value through the existing change path");
assert.match(styles, /\.style-question select\.has-bubbles\s*\{[^}]*display:\s*none/s, "The native dropdown must give way to its bubbles");

// A destination the geocoder was still checking must never be reported as misspelled: the
// debounced lookup and the continue action shared one request, so aborting the first
// rejected the second without re-fetching, and real cities (Berlin, Los Angeles) came back
// as "check the spelling".
assert.match(script, /async function verifyDestinationGeocode\(destination\)/, "Destination verification must be retryable");
assert.match(script, /if \(error\?\.name !== "AbortError"\)[\s\S]{0,200}?status: "unavailable"/, "A failed check must read as unavailable, not invalid");
assert.match(script, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/, "An aborted verification must be retried once on a fresh request");
// "Choose for me" builds the guide from whatever has been answered so far.
assert.equal((html.match(/data-finish-questions/g) || []).length, 2, "Both question steps must offer Choose for me");
assert.match(html, /data-finish-questions>Not sure where to begin\? Choose for me<\/button>/, "Choose for me must keep its wording");
assert.match(script, /\[data-finish-questions\][\s\S]{0,320}?showStepQuestion\(4, stepQuestions\(4\)\.length - 1\)[\s\S]{0,120}?createTripButton/, "Choose for me must finish through the real create action");

// Leaving Trip Basics settles the destination, so the place-specific answers are reconciled
// there too. Checking only on entry to Steps 3/4 left routes uncovered: Los Angeles showed
// LA's area chips with Tokyo's "Shinjuku" still typed in the home base field.
assert.match(
  script,
  /clearTimeout\(destinationResearchTimer\);[\s\S]{0,320}?syncPreferencesToDestination\(\);/,
  "Leaving Trip Basics must reconcile the answers with the destination"
);

// The welcome screen offers only Import beside the primary action: See How It Works was
// removed because the footer Learn More link already opens the same lightbox.
assert.doesNotMatch(stepOneHtml, /See How It Works/, "The welcome screen must not duplicate the Learn More entry point");
assert.match(stepOneHtml, /id="nextStepButton"[\s\S]{0,500}?<div class="landing-secondary-actions">[\s\S]{0,400}?data-open-import/, "Import must sit alongside the primary action");
assert.match(html, /data-open-learn-more>Learn More<\/button>/, "Learn More must remain reachable from the footer");
assert.match(stepOneHtml, /id="nextStepButton"[^>]*>\s*<img class="cta-mark"/, "The primary action must carry the brand mark before its label");
assert.match(styles, /\.merged-start-continue\s*\{[^}]*background:\s*#e2621f/s, "The primary action must be orange");
assert.match(styles, /\.learn-more-panel\s*\{[^}]*border-radius:\s*14px/s, "Learn More groups must render as panels");
assert.match(styles, /\.trip-basics-action-row \.see-how-button\s*\{[^}]*border-radius:\s*999px/s, "See How It Works must use the reference pill shape");
// The product promise stays on one line on desktop; phones still wrap it.
assert.match(styles, /@media \(min-width: 900px\)[\s\S]{0,260}?p\.hero-support[\s\S]{0,120}?white-space:\s*nowrap/s, "The hero promise must not wrap on a wide display");
