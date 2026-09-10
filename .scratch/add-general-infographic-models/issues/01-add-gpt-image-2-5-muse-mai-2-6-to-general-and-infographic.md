# 01: Add GPT-Image-2.5, Muse Image, and MAI-Image-2.6 to General and Infographic model dropdowns

**What to build:** In the Studio app, a user opening the model dropdown in **General** mode or **Infographic** mode sees three additional selectable models — "OpenAI: GPT Image 2.5" (`openai/gpt-image-2.5-flare`), "Meta: Muse Image" (`meta/muse-image`), and "Microsoft: MAI-Image-2.6" (`microsoft/mai-image-2.6`) — regardless of whether OpenRouter's live model feed has picked them up yet. Selecting one and generating routes through the correct OpenRouter API path (chat/completions vs. Images API) based on that model's declared output modalities, the same way every existing fallback model already works. No other mode's dropdown is affected.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] All three new models (`openai/gpt-image-2.5-flare`, `meta/muse-image`, `microsoft/mai-image-2.6`) appear in the General mode model dropdown.
- [ ] All three new models appear in the Infographic mode model dropdown.
- [ ] Existing models already in either dropdown (e.g. `openai/gpt-image-2`, `google/gemini-3-pro-image`) are still present and unaffected — no regression to the shared fallback list or the Infographic allowlist.
- [ ] Video, Cinematic, Audio, and TTS mode dropdowns are unchanged (these three models must not appear there; they use separate id lists untouched by this change).
- [ ] Each new model's declared output modalities (`["image"]` vs `["image", "text"]`) is verified against OpenRouter's model page before being set, so generation routes to the correct API path instead of failing with "No endpoints found".
- [ ] A test generation succeeds (or fails with a sane, non-routing error) for each of the three models in General mode.
- [ ] `npm run build` passes with no TypeScript errors.
- [ ] If per-image pricing is available for a model, it is set on that entry; otherwise it ships with empty pricing, matching how other fallback entries (e.g. `openai/gpt-image-2`) currently ship.
