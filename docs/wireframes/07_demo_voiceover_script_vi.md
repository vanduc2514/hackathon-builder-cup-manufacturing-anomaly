# Demo Voiceover & Dialogue Script (Vietnamese) — Draft (TKT-#42)

> **Status:** DRAFT dialogue only. All `[[TODO:#80]]` placeholders must be replaced with the real numbers once the Cloud Run run completes (ETA 2026-10-17 15:00): 240 scrap avoided, 45 min downtime, 38 kWh, 25 kg CO₂e, $3,600 savings are the numbers already published for the CNC use case in [`../Kaizen_Agent.md`](../Kaizen_Agent.md) — reuse them only if the live run reproduces that scenario; otherwise swap for whatever the live run actually shows.
> **Pairs with:** [`05_demo_storyboard_90s.md`](./05_demo_storyboard_90s.md) (timing) and [`06_demo_screen_choreography.md`](./06_demo_screen_choreography.md) (on-screen state).
> **Voices:** **Narrator (VO)** — pitch narrator, calm and confident, English or Vietnamese depending on the judging panel; **Technician (Tuấn)** — on-camera, natural shop-floor Vietnamese; **Copilot (AI)** — Gemini Live synthesized voice, also Vietnamese, citation-grounded, never invents steps.

---

## 1. Beat 1–2 — Cold open & Detect (`00:00–00:20`)

**Narrator (VO):**
> "Trên một dây chuyền CNC, một lỗi bề mặt bị bỏ sót chỉ 20 phút cũng đủ tạo ra hàng trăm sản phẩm lỗi trước khi QC cuối ca kịp phát hiện."

*(Beat 2 — Inject defect; SPC spikes, AnomalyBanner appears)*

**Narrator (VO):**
> "Kaizen Agent phát hiện ngay tại trạm — camera biên [Gemma] phân loại lỗi trong dưới 50 mi-li-giây, không cần chờ ca sau."

---

## 2. Beat 3 — Diagnose (`00:20–00:45`)

**Narrator (VO):**
> "Một nhóm agent AI lần ngược nguyên nhân: Traceability khoanh vùng đúng máy CNC-02, dao T07 — không phải lô nhôm. Process Analyst thấy độ rung tăng 35% từ 9 giờ 30. Knowledge Agent trích dẫn đúng trang 112 trong tài liệu máy. Agent phân tích nguyên nhân gốc kết luận: dao T07 mòn, độ tin cậy 87%."

*(On-screen: confidence ring animates to 87%, citation chip "manual p.112" visible — no narration needed over the citation beat, let the UI speak for itself for ~2s.)*

---

## 3. Beat 4 — Repair + Gatekeeper (`00:45–00:70`) — core dialogue beat

This is the only beat with live two-way dialogue. Keep lines short — shop-floor Vietnamese, not written Vietnamese.

**Technician (Tuấn), raising phone to the machine:**
> "Máy CNC-02 bị gì, sửa thế nào?"

**Copilot (AI), via Gemini Live, step-by-step, each instruction grounded in a citation:**
> "Theo tài liệu bảo trì trang 112: dao T07 đã mòn. Anh tháo nắp bên trái ra trước."

*(beat: technician opens the panel on camera)*

> "Đúng rồi. Giờ anh kiểm tra độ đảo của dao — so với thông số trong sách là bốn mươi lăm niu-tơn-mét, sai số cho phép là cộng trừ một."

*(beat: technician performs the torque check)*

**Technician (Tuấn):**
> "Xong rồi, đã thay dao mới."

**Copilot (AI):**
> "Đã ghi nhận. Hệ thống sẽ xác nhận bằng ảnh sản phẩm thật — chưa đóng sự cố ngay, cần đủ năm mươi sản phẩm đạt liên tiếp."

*(On-screen left pane: StreakGate climbs; narrator stays silent for ~6s to let the counter speak, then:)*

**Narrator (VO), over the StreakGate climbing:**
> "Hệ thống không đóng sự cố chỉ vì lời xác nhận — phải chờ camera quang học xác nhận đủ 50 sản phẩm đạt chuẩn liên tiếp mới mở khóa nút duyệt cho trưởng ca."

---

## 4. Beat 5 — Document + Learn (`00:70–00:85`)

**Narrator (VO):**
> "Khi đủ 50/50, trưởng ca duyệt — báo cáo 8D và SOP mới được soạn tự động. Và đây là tấm thẻ tác động của một sự cố được xử lý sớm:"

**On-screen Impact Card reads aloud (narrator or on-screen numerals, final numbers from #80):**
> "`[[TODO:#80]]` sản phẩm lỗi được ngăn chặn · `[[TODO:#80]]` phút ngừng máy được tiết kiệm · `[[TODO:#80]]` kWh và `[[TODO:#80]]` kg CO2 giảm phát thải · tương đương `[[TODO:#80]]` đô-la tiết kiệm."

*(Placeholder reference only — CNC use case numbers already published: 240 scrap avoided · 45 min downtime · 38 kWh · 25 kg CO₂e · $3,600. Use only if the live #80 run matches this scenario.)*

---

## 5. Beat 6 — Closing card (`00:85–00:90`)

**Narrator (VO):**
> "Kaizen Agent — từ sản phẩm lỗi đến tri thức được giữ lại, không lặp lại cùng một sai sót."

---

## 6. Open items

- [ ] Confirm whether the judging panel needs English subtitles burned in (Vietnamese audio + English captions) or a fully English VO track — ask Kaizen PM before lock.
- [ ] Record a native-Vietnamese shop-floor speaker for the Technician lines; current lines are written for naturalness but need a read-through by a Vietnamese speaker for cadence.
- [ ] Swap every `[[TODO:#80]]` once the real Cloud Run run is reported done by Kaizen Tech Lead.
- [ ] Confirm Gemini Live TTS voice profile (Copilot) matches the `vi-VN` locale chip already shown in the wireframe (`02_technician_copilot.md` §4).
