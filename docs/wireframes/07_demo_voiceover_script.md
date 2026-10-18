# Demo Voiceover & Dialogue Script — Draft (TKT-#42)

> **Status:** DRAFT dialogue only. All `[[TODO:#80]]` placeholders must be replaced with the real numbers once the Cloud Run run completes (ETA 2026-10-17 15:00): 240 scrap avoided, 45 min downtime, 38 kWh, 25 kg CO₂e, $3,600 savings are the numbers already published for the CNC use case in [`../Kaizen_Agent_en.md`](../Kaizen_Agent_en.md) — reuse them only if the live run reproduces that scenario; otherwise swap for whatever the live run actually shows.
> **Pairs with:** [`05_demo_storyboard_90s.md`](./05_demo_storyboard_90s.md) (timing) and [`06_demo_screen_choreography.md`](./06_demo_screen_choreography.md) (on-screen state).
> **Voices:** **Narrator (VO)** — pitch narrator, calm and confident, English; **Technician (Tuan)** — on-camera, natural shop-floor speech; **Copilot (AI)** — Gemini Live synthesized voice, citation-grounded, never invents steps.

---

## 1. Beat 1–2 — Cold open & Detect (`00:00–00:20`)

**Narrator (VO):**
> "On a CNC line, a surface defect missed for just 20 minutes is enough to produce hundreds of faulty parts before the end-of-shift QC catches it."

*(Beat 2 — Inject defect; SPC spikes, AnomalyBanner appears)*

**Narrator (VO):**
> "Kaizen Agent detects it right at the station — the edge camera [Gemma] classifies the defect in under 50 milliseconds, with no waiting for the next shift."

---

## 2. Beat 3 — Diagnose (`00:20–00:45`)

**Narrator (VO):**
> "A team of AI agents traces the cause: Traceability pinpoints machine CNC-02, tool T07 — not the aluminum batch. The Process Analyst sees vibration up 35% since 9:30. The Knowledge Agent cites page 112 of the machine manual. The root-cause agent concludes: tool T07 is worn, confidence 87%."

*(On-screen: confidence ring animates to 87%, citation chip "manual p.112" visible — no narration needed over the citation beat, let the UI speak for itself for ~2s.)*

---

## 3. Beat 4 — Repair + Gatekeeper (`00:45–00:70`) — core dialogue beat

This is the only beat with live two-way dialogue. Keep lines short — shop-floor speech, not written prose.

**Technician (Tuan), raising phone to the machine:**
> "What's wrong with CNC-02, and how do I fix it?"

**Copilot (AI), via Gemini Live, step-by-step, each instruction grounded in a citation:**
> "Per the maintenance manual, page 112: tool T07 is worn. Remove the left cover first."

*(beat: technician opens the panel on camera)*

> "Right. Now check the tool runout — the manual spec is forty-five newton-meters, tolerance plus or minus one."

*(beat: technician performs the torque check)*

**Technician (Tuan):**
> "Done, I've fitted a new tool."

**Copilot (AI):**
> "Noted. The system will verify with images of real parts — the incident is not closed yet; fifty consecutive good parts are required."

*(On-screen left pane: StreakGate climbs; narrator stays silent for ~6s to let the counter speak, then:)*

**Narrator (VO), over the StreakGate climbing:**
> "The system does not close the incident on a verbal confirmation alone — it waits for the optical camera to confirm 50 consecutive passing parts before unlocking the approve button for the shift leader."

---

## 4. Beat 5 — Document + Learn (`00:70–00:85`)

**Narrator (VO):**
> "At 50/50 the shift leader approves — the 8D report and a new SOP are drafted automatically. And here is the impact card for an incident handled early:"

**On-screen Impact Card reads aloud (narrator or on-screen numerals, final numbers from #80):**
> "`[[TODO:#80]]` defective parts prevented · `[[TODO:#80]]` minutes of downtime saved · `[[TODO:#80]]` kWh and `[[TODO:#80]]` kg CO2 emissions avoided · equivalent to `[[TODO:#80]]` dollars saved."

*(Placeholder reference only — CNC use case numbers already published: 240 scrap avoided · 45 min downtime · 38 kWh · 25 kg CO₂e · $3,600. Use only if the live #80 run matches this scenario.)*

---

## 5. Beat 6 — Closing card (`00:85–00:90`)

**Narrator (VO):**
> "Kaizen Agent — from a defective part to knowledge retained, so the same mistake never repeats."

---

## 6. Open items

- [ ] Confirm whether the judging panel needs a localized VO track or captions — ask Kaizen PM before lock.
- [ ] Have a native shop-floor speaker read the Technician lines for cadence.
- [ ] Swap every `[[TODO:#80]]` once the real Cloud Run run is reported done by Kaizen Tech Lead.
- [ ] Confirm the Gemini Live TTS voice profile (Copilot) matches the language chip shown in the wireframe (`02_technician_copilot.md` §4).
