# Nutrition workspace checkpoint

The nutrition module at `/day/meals` has its own My week, Meal ideas, Food journal and My recipes sections. The active section is retained in the URL. This is a browser-local development checkpoint; it is not account-synchronized or a clinical nutrition service.

## Active planning

**Suggest my week** works before the user creates a recipe library. It combines their saved recipes, explicitly chosen family favorites and a small curated collection of linked recipes. Likes, dislikes, ingredient exceptions, hidden ideas, meal categories and prep/cook time guide selection. This uses deterministic selection, not live AI web search. A single-slot swap leaves the rest of the week unchanged. Saving a suggested week also saves the linked recipes it uses; it never records food as eaten.

Family favorites can be menu names without recipes. Their ingredients and nutrition remain unknown. The grocery checklist covers matching recipes with known ingredient lists and explains the missing quantities and family-recipe ingredients. It does not silently fabricate shopping amounts or nutrient values.

## Recipe discovery and provenance

`meal-ideas.ts` contains source metadata from ten recipe pages opened on November 21, 2026: MedlinePlus and Nutrition.gov. Ingredient names, source recipe yields and stated timing are retained. Ingredient alternatives remain explicit. Full ingredient quantities, preparation instructions and optional source nutrition remain on the original linked pages; government hosting is not treated as blanket reuse permission for FoodHero or other credited recipe authors.

Unknown times stay unknown. Overnight Oatmeal's chilling requirement is disclosed separately. Recipe yields are household cooking metadata rather than recommended individual portions. Hiding an idea affects future suggestions, not already saved plans, and can be reversed.

## Preferences and compatibility

The local-only profile review can fill confirmed chat preferences without hardcoding private data into the public repository. An initially unknown allergy answer can use a later explicit report; already recorded restrictions are not silently removed. Dislikes allowed inside other recipes are distinct from allergies and do not override allergy matches. Unknown fields in older workspaces receive empty defaults; existing recipes, journals, calendars and plans are preserved.

Current preference matching is conservative text matching, not allergen-safety certification. Source alternatives, product labels, missing ingredients and substitutions need review. Future live recipe search requires a permitted source and separate end-to-end verification.

## Student nutrition scope

The module supports ordinary meal planning, regular nourishment and optional self-reported food-label information. It exposes no calorie/macro targets, surplus/deficit calculators, bulking/cutting presets, body-weight tracking, weigh-in schedules or weight-change optimization. Individualized weight-change advice belongs with a clinician or registered sports dietitian working with the student and family. See the [AAP's guidance for young athletes](https://www.healthychildren.org/English/healthy-living/sports/pages/Safe-Weight-Loss-and-Weight-Gain-for-Young-Athletes.aspx).

## Verification

Unit checks cover drafting with an empty library, favorites without invented ingredients, egg-dish versus ingredient exceptions, restriction precedence, one-slot swaps, hiding/restoration candidates, timing provenance and older-data migration. Browser checks cover suggestions, approval/save/reload, linked discovery, reversible hiding, module navigation, mobile layouts and the existing food journal. These bounded checks do not establish full medical suitability, comprehensive allergen detection, live retrieval or launch readiness.
