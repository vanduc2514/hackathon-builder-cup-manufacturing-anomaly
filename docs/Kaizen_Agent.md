# Kaizen Agent: Đội AI kiểm tra sản phẩm và truy ngược nguyên nhân trên dây chuyền sản xuất

**Chủ đề dự thi:** Manufacturing (Sản xuất), lồng ghép Sustainability (Phát triển bền vững).

"Kaizen" là triết lý cải tiến liên tục của Nhật, rất quen thuộc trong nhà máy. Tên gọi giúp ban giám khảo ngành sản xuất hiểu ngay sản phẩm làm gì.

**Một câu tóm tắt:** Kaizen Agent nhìn vào *sản phẩm* đi ra khỏi dây chuyền, phát hiện lỗi sớm nhất có thể, rồi truy ngược về *máy, dao cụ, khuôn, vật liệu hay quy trình* nào gây ra lỗi đó, hướng dẫn thợ sửa bằng giọng nói tiếng Việt, xác nhận hết lỗi bằng chính sản phẩm, và lưu lại kinh nghiệm để không lặp lại.

---

## 1. Vấn đề cần giải quyết

Các nhà máy vừa và nhỏ ở Đông Nam Á (điện tử, linh kiện ô tô, nhựa, dệt may) đang gặp 5 khó khăn:

| Khó khăn | Hậu quả |
|---|---|
| **Máy không dừng nhưng âm thầm sản xuất ra phế phẩm** (dao mòn, khuôn lệch, nhiệt trôi, liệu ẩm) | Đến khi QC cuối ca hoặc khách hàng phát hiện thì đã mất cả lô. Chi phí phế phẩm và làm lại thường lớn hơn chi phí dừng máy. |
| Khi phát hiện lỗi sản phẩm, **không biết lỗi do máy nào, công đoạn nào** | Dây chuyền có nhiều máy chạy song song; việc truy tìm bằng tay mất hàng giờ, trong lúc đó máy lỗi vẫn tiếp tục chạy. |
| Chỉ 1–2 kỹ thuật viên lâu năm biết sửa | Họ nghỉ phép, nghỉ việc hay ở ca khác thì không ai xử lý được. Kinh nghiệm nằm trong đầu họ, không có trên giấy. |
| Tài liệu máy viết bằng tiếng Anh hoặc tiếng Nhật | Công nhân và kỹ thuật viên tuyến đầu chủ yếu nói tiếng Việt, Thái, Indonesia; đọc không hiểu hoặc mất nhiều thời gian. |
| Báo cáo nguyên nhân sự cố (8D) mất nhiều ngày mới viết xong | Sự cố cũ dễ lặp lại. Mỗi lần lặp lại là thêm phế phẩm và lãng phí điện năng, nguyên liệu. |

Điểm chung: **sản phẩm lỗi là triệu chứng sớm nhất và khách quan nhất** của một vấn đề trên dây chuyền, nhưng hiện nay thông tin đó không được nối với dữ liệu máy móc và tri thức sửa chữa.

---

## 2. Nguyên tắc thiết kế: Sản phẩm trước, máy sau (Product-first)

Kaizen Agent **không** bắt đầu từ cảm biến máy. Hệ thống bắt đầu từ trạm kiểm tra sản phẩm, và chỉ dùng dữ liệu máy để truy ngược.

```
Kiểm tra sản phẩm  →  Phát hiện lỗi / tỷ lệ lỗi tăng
       ↓
Truy vết: sản phẩm này do máy nào, dao/khuôn nào, lô liệu nào, ca nào làm ra?
       ↓
Khoanh vùng nghi phạm  →  Kéo dữ liệu cảm biến ĐÚNG máy đó, ĐÚNG khung giờ đó
       ↓
Tra sổ tay, nhật ký, sự cố cũ  →  Tìm nguyên nhân gốc (5-Whys, Ishikawa)
       ↓
Hướng dẫn sửa bằng giọng nói + camera
       ↓
Kiểm tra lại sản phẩm: N sản phẩm liên tiếp đạt  →  mới đóng sự cố
       ↓
Soạn 8D, phiếu công việc, sửa SOP  →  Con người duyệt  →  Lưu vào kho tri thức
```

Vì sao hướng này mạnh hơn hướng "cảm biến máy báo động trước":

- Máy hỏng hẳn thì ai cũng biết. Nguy hiểm là máy vẫn chạy nhưng tạo ra phế phẩm hàng giờ mà không ai hay. Chỉ có sản phẩm mới "nói" ra điều đó.
- Nguyên nhân không phải lúc nào cũng nằm ở máy. Có thể là vật liệu, môi trường, thao tác. Nếu chỉ nhìn cảm biến máy thì không bao giờ tìm ra (xem Use case 2).
- Vòng lặp khép kín: sự cố chỉ được đóng khi *sản phẩm* xác nhận hết lỗi, không phải khi thợ nói "xong".

Cảm biến máy vẫn có một **đường phụ** cảnh báo sớm (rung tăng vọt, tiếng máy lạ), nhưng đó là tín hiệu bổ trợ, không phải điểm khởi phát chính của quy trình.

---

## 3. Giải pháp: một "đội" AI phối hợp, chia thành 4 pha

Thay vì một chatbot đơn lẻ, Kaizen Agent là một đội nhiều AI agent, mỗi agent một chuyên môn, giống một tổ kỹ thuật thu nhỏ. Toàn bộ được điều khiển bởi một **Agent Điều phối (Orchestrator)** xây bằng ADK (Agent Development Kit của Google).

### Tổng quan đội agent

| Pha | Agent | Việc làm | Công nghệ chính |
|---|---|---|---|
| A. Phát hiện | **Kiểm tra sản phẩm** (Quality Inspector) | Soi ảnh từng sản phẩm, phân loại kiểu lỗi, vị trí, mức độ; theo dõi biểu đồ kiểm soát SPC; được Điều phối gọi và trả kết quả phân loại (Điều phối mở sự cố khi vượt ngưỡng) | Gemma tại gateway + Gemini Vision |
| B. Truy ngược | **Truy vết** (Traceability) | Nối sản phẩm lỗi với máy, công đoạn, dao/khuôn, lô vật liệu, người vận hành, thông số; đưa ra danh sách nghi phạm xếp hạng | BigQuery + ADK tool |
| B. Truy ngược | **Phân tích cảm biến** (Process Analyst) | Kéo dữ liệu cảm biến của đúng máy bị nghi, đúng khung giờ, so với baseline | BigQuery + Gemini |
| B. Truy ngược | **Tra cứu tri thức** (Knowledge) | Tìm trong sổ tay, nhật ký bảo trì, báo cáo 8D cũ, video thợ giỏi; thư viện "lỗi → nguyên nhân"; luôn trích dẫn nguồn | Vertex AI Search / RAG |
| B. Truy ngược | **Nguyên nhân gốc** (RCA) | Tổng hợp bằng chứng, chạy 5-Whys và Ishikawa, đưa giả thuyết xếp hạng kèm độ tin cậy; yêu cầu thêm bằng chứng nếu chưa đủ | Gemini |
| C. Xử lý | **Hướng dẫn sửa** (Repair Guide) | Hội thoại giọng nói + camera thời gian thực bằng tiếng Việt, từng bước, có trích nguồn | Gemini Live API |
| C. Xử lý | **Hành động & Tài liệu** (Action) | Soạn phiếu công việc, báo cáo 8D, đề xuất sửa SOP; trả về Điều phối để chuyển cho trưởng ca duyệt | Gemini |
| D. Học hỏi | **Lưu tri thức & Tác động** (Knowledge Capture) | Biến video thợ giỏi và sự cố vừa xử lý thành mục mới trong kho tri thức; tính thẻ tác động | Gemini Video + BigQuery |

### Pha A: Phát hiện bất thường từ sản phẩm

**Hạ tầng dữ liệu.** Camera tại trạm kiểm tra chụp từng sản phẩm. Cảm biến trên máy (nhiệt độ, độ rung, dòng điện, áp suất) và micro ghi âm tiếng máy gửi dữ liệu qua OPC-UA/MQTT lên Google Cloud. Pub/Sub là "băng chuyền" nhận dữ liệu thời gian thực; BigQuery là kho lưu trữ và phân tích. Quan trọng nhất, mỗi sản phẩm được gắn **mã truy vết** (mã QR/khắc laser hoặc đơn giản là dấu thời gian + vị trí trên băng tải) để nối được với máy đã sản xuất ra nó.

**Gateway tại nhà máy.** Một máy tính nhỏ chạy Gemma, mô hình mã nguồn mở và nhẹ của Google, làm hai việc ngay tại chỗ: phân loại nhanh ảnh sản phẩm đạt/lỗi, và phát hiện bất thường trong tín hiệu cảm biến/âm thanh máy. Chỉ ảnh lỗi và tín hiệu bất thường mới được gửi lên cloud. Lợi ích: nhanh, tiết kiệm băng thông, và dữ liệu thô nhạy cảm không phải rời nhà máy. Nhà máy rất quan tâm điểm này về bảo mật.

**Agent Kiểm tra sản phẩm.** Sự kiện lỗi / SPC từ gateway đi vào Agent Điều phối, không đi thẳng tới các agent. Điều phối gọi Kiểm tra sản phẩm, agent này lấy ảnh lỗi và dùng Gemini phân loại chi tiết: kiểu lỗi (xước, bavia, thiếu liệu, lệch, rỗ…), vị trí trên sản phẩm, mức độ. Theo dõi tỷ lệ lỗi theo biểu đồ kiểm soát SPC. Khi tỷ lệ lỗi vượt giới hạn kiểm soát hoặc xuất hiện kiểu lỗi mới, Agent Điều phối mở sự cố và ghi kết quả phân loại của Kiểm tra sản phẩm vào bảng.

> Ví dụ đầu ra: *"Lỗi xước dọc 2–3 mm trên mặt A, bắt đầu lúc 09:40, 23/300 sản phẩm (7,7%), đang tăng. Trước đó tỷ lệ nền 0,5%."*

### Pha B: Truy ngược và điều tra nguyên nhân

Agent Điều phối nhận sự cố và giao việc theo thứ tự có chủ đích:

**Bước 1. Agent Truy vết (chạy trước, bắt buộc).** Từ mã sản phẩm hoặc khung giờ lỗi, tra bảng truy vết trong BigQuery: sản phẩm này đi qua máy nào, công đoạn nào, dùng dao/khuôn nào, lô vật liệu nào, ai vận hành, thông số cài đặt ra sao. Agent so sánh nhóm sản phẩm lỗi với nhóm sản phẩm đạt cùng thời điểm để loại trừ yếu tố không liên quan, rồi đưa ra danh sách nghi phạm có xếp hạng.

> Ví dụ: *"100% sản phẩm lỗi đi qua CNC-02, dao T07. CNC-01 và CNC-03 dùng cùng lô nhôm nhưng không lỗi → loại trừ vật liệu. Nghi phạm số 1: CNC-02 / dao T07 (điểm 0,95)."*

**Bước 2. Agent Phân tích cảm biến và Agent Tra cứu tri thức (chạy song song).**

Phân tích cảm biến chỉ kéo dữ liệu của máy bị nghi, trong khung giờ quanh thời điểm lỗi, so với baseline của chính máy đó. Nhờ đã khoanh vùng nên không phải "mò" trong toàn bộ dây chuyền.

> Ví dụ: *"Rung trục chính CNC-02 tăng 35% từ 09:30, dòng điện trục chính tăng 12%. Nhiệt độ ổ trục bình thường. Thời điểm rung tăng sớm hơn thời điểm sản phẩm lỗi 10 phút."*

Tra cứu tri thức tìm theo hai khóa: kiểu lỗi sản phẩm và máy bị nghi. Nguồn gồm sổ tay thiết bị, nhật ký bảo trì, báo cáo 8D cũ, và quy trình trích từ video thợ giỏi. Mọi kết quả đều kèm trích dẫn.

> Ví dụ: *"Sổ tay CNC trang 112: xước dọc kèm rung tăng là dấu hiệu dao mòn. Nhật ký bảo trì: dao T07 thay lần cuối 18 ngày trước, đã cắt 2.400 chi tiết; tuổi thọ nhà sản xuất khuyến cáo 2.000. Sự cố tương tự ngày 12/3 đã xử lý bằng thay insert."*

**Bước 3. Agent Nguyên nhân gốc.** Tổng hợp tất cả bằng chứng và phân tích theo hai phương pháp chuẩn của ngành:

- **5-Whys**, luôn bắt đầu từ sản phẩm: *Sản phẩm xước dọc → vì dao T07 trên CNC-02 bị mòn → vì dao đã chạy quá tuổi thọ → vì lịch thay dao tính theo ngày, không theo số chi tiết → vì SOP cũ không có bộ đếm.*
- **Biểu đồ xương cá (Ishikawa)**: xếp bằng chứng vào các nhóm Con người, Máy móc, Vật liệu, Phương pháp, Môi trường, Đo lường để không bỏ sót nhánh nào.

Agent đưa ra giả thuyết xếp hạng kèm độ tin cậy (ví dụ 87%). Nếu độ tin cậy dưới ngưỡng (ví dụ 70%), agent **không kết luận** mà ghi rõ cần thêm bằng chứng gì (ví dụ "ảnh cận cảnh lưỡi dao"); Agent Điều phối sẽ chuyển yêu cầu đó thành câu hỏi cho thợ qua kênh giọng nói.

### Pha C: Hướng dẫn sửa và xác nhận bằng sản phẩm

**Agent Hướng dẫn sửa.** Kỹ thuật viên giơ điện thoại về phía máy và nói tiếng Việt như gọi video với chuyên gia: *"Máy này bị gì, tôi phải làm sao?"* Gemini Live API, vừa nhìn qua camera vừa nghe, trả lời từng bước: *"Anh tháo nắp bên trái… đúng rồi, giờ kiểm tra độ đảo của dao…"* Mỗi chỉ dẫn đều trích nguồn ("theo sổ tay trang 112") để thợ tin tưởng và kiểm chứng được. AI không tự bịa cách sửa; nếu không có nguồn, AI nói rõ là không có và đề nghị gọi kỹ thuật viên cấp cao.

Khi cần thêm bằng chứng, chính kênh này cũng là nơi hệ thống hỏi ngược lại thợ: *"Anh chụp giúp cận cảnh lưỡi dao để tôi xác nhận."*

**Xác nhận bằng sản phẩm.** Sau khi thợ báo đã sửa, hệ thống **không đóng sự cố ngay**. Agent Điều phối yêu cầu Agent Kiểm tra sản phẩm theo dõi tiếp; chỉ khi N sản phẩm liên tiếp đạt (ví dụ 50) và tỷ lệ lỗi về mức nền thì sự cố mới được đóng. Nếu lỗi vẫn còn, quay lại Pha B với bằng chứng mới ("đã thay dao nhưng vẫn xước → nguyên nhân khác").

**Agent Hành động & Tài liệu.** Tự soạn sẵn 3 tài liệu:

1. **Phiếu công việc (work order):** giao việc sửa chữa, đặt phụ tùng.
2. **Báo cáo 8D:** mẫu báo cáo xử lý sự cố 8 bước, chuẩn trong ngành ô tô và điện tử. Bình thường mất vài ngày để viết; AI soạn trong vài giây từ chính bảng sự cố.
3. **Đề xuất cập nhật SOP:** bổ sung bước phòng ngừa để sự cố không lặp lại.

Quản lý hoặc trưởng ca duyệt rồi mới chính thức áp dụng. Con người luôn là người quyết định cuối cùng.

### Pha D: Học hỏi và đo tác động

**Lưu giữ kinh nghiệm của thợ giỏi.** Kỹ thuật viên lâu năm quay một video 2 phút, vừa làm vừa giải thích cách sửa một lỗi khó. Gemini xem video, chuyển thành quy trình từng bước có hình ảnh và lưu vào kho tri thức. Đồng thời, mỗi sự cố vừa đóng cũng được thêm vào **thư viện "lỗi → nguyên nhân → cách sửa"**, nên lần sau gặp kiểu lỗi tương tự thì Agent Tra cứu tìm ra ngay. Khi thợ giỏi nghỉ hưu hay nghỉ việc, tay nghề của họ vẫn ở lại nhà máy.

**Thẻ tác động.** Mỗi sự cố có một thẻ hiển thị, theo thứ tự ưu tiên:

1. **Số phế phẩm tránh được** = (thời gian phát hiện sớm hơn so với QC thủ công) × (tốc độ dây chuyền). Đây là chỉ số trung tâm của hướng Product-first.
2. Số phút dừng máy tiết kiệm được so với cách xử lý thông thường.
3. Số kg nguyên liệu, kWh điện và lượng CO₂ giảm được (nguyên liệu và năng lượng đã tiêu tốn để làm ra phế phẩm, cộng chi phí tái chế).

Đây là phần chứng minh phát triển bền vững và dùng để tranh giải phụ Most Impactful Solution.

---

## 4. Các agent giao tiếp với nhau như thế nào

Các agent **không chat tự do với nhau**. Hệ thống dùng mô hình **bảng sự cố chung** (shared incident state, kiểu "blackboard") lưu trên Firestore, do Agent Điều phối (ADK) điều khiển. Điều phối là cửa vào và cửa ra duy nhất: nhận mọi đầu vào (sự kiện lỗi/SPC, báo cáo của thợ, phê duyệt của trưởng ca), đưa bảng cho agent được gọi, ghi phát hiện mà agent trả về vào bảng (là bên duy nhất ghi bảng), quyết định gọi ai tiếp theo, và phát hành mọi đầu ra (dashboard, tài liệu chờ duyệt, mục mới trong kho tri thức, thẻ tác động). Các agent không nhận sự kiện từ bên ngoài, không ghi bảng, và không trao đổi trực tiếp với nhau hay với con người.

Các ngoại lệ đã ghi nhận:

- **Dashboard chỉ đọc:** dashboard đọc bảng (sự cố hiện tại + luồng sự kiện trực tiếp); chỉ Điều phối ghi bảng.
- **Agent tra cứu bằng công cụ:** Truy vết/Phân tích cảm biến truy vấn BigQuery, RCA/Copilot tra RAG, các agent gọi Gemini. Đây là truy vấn dữ liệu, không phải đầu vào/đầu ra của sự cố.
- **Nạp dữ liệu (data plane):** Pub/Sub → BigQuery lưu telemetry thô và dữ liệu truy vết.
- **Phiên trực tiếp của Technician Copilot:** luồng giọng nói + camera trực tiếp với thợ (Gemini Live) không thể chuyển tiếp qua Điều phối; Điều phối mở và kết thúc phiên, nhận kết quả (bằng chứng chẩn đoán, sửa xong).
- **Giao diện dev của ADK:** `adk web` / `adk run` chạy thẳng đồ thị workflow, không qua lớp Orchestrator runner (chỉ dùng khi phát triển, tiến trình riêng, bảng trong bộ nhớ).

Mọi thông điệp đều có 4 phần bắt buộc: **phát hiện – bằng chứng – độ tin cậy – nguồn trích dẫn**. Nhờ vậy, mọi kết luận đều kiểm chứng được, và màn hình demo chỉ cần hiển thị bảng sự cố này là giám khảo thấy rõ từng agent đang làm gì.

### Luồng một sự cố điển hình

| # | Ai | Làm gì | Kết quả (Điều phối ghi vào bảng sự cố) |
|---|---|---|---|
| 1 | Điều phối | Nhận sự kiện `defect_spike` từ gateway / SPC, mở sự cố INC-0412, gọi Kiểm tra sản phẩm phân loại lỗi | `{event: "defect_spike", type: "scratch_vertical", rate: 0.077, since: "09:40"}` |
| 2 | Điều phối | Ghi kết quả phân loại của Kiểm tra sản phẩm, gọi Truy vết (tuần tự, bắt buộc) | `{incident: "INC-0412", status: "tracing"}` |
| 3 | Truy vết | Khoanh vùng nghi phạm | `{suspects: [{machine: "CNC-02", tool: "T07", score: 0.95}], excluded: ["material_lot"]}` |
| 4 | Điều phối | Gọi **song song** Phân tích cảm biến (CNC-02, 09:00–10:00) và Tra cứu tri thức (xước dọc + CNC-02) | `{status: "investigating"}` |
| 5 | Phân tích cảm biến | Trả kết quả | `{finding: "vibration +35%, current +12%", since: "09:30", confidence: 0.8}` |
| 5 | Tra cứu tri thức | Trả kết quả | `{finding: "tool wear", sources: ["manual p.112", "maint_log T07", "8D 2026-03-12"]}` |
| 6 | Điều phối | Gọi RCA | `{status: "analyzing"}` |
| 7 | RCA | Kết luận hoặc yêu cầu thêm bằng chứng | `{root_cause: "T07 worn, over tool life", confidence: 0.87, whys: [...], ishikawa: {Machine: ..., Method: ...}}` |
| 7b | RCA (nếu confidence < 0.7) | Yêu cầu bằng chứng | `{need: "close-up photo of insert"}` → Điều phối chuyển thành câu hỏi cho thợ qua Gemini Live → ảnh về → quay lại bước 7 |
| 8 | Điều phối | Gọi **song song** Hướng dẫn sửa (cho thợ) và Hành động (soạn 8D nháp) | `{status: "repairing"}` |
| 9 | Hướng dẫn sửa | Thợ báo xong; trả kết quả về Điều phối | `{repair_done: true, steps_taken: [...]}` |
| 10 | Điều phối | Yêu cầu Kiểm tra sản phẩm xác nhận 50 sản phẩm liên tiếp đạt | `{status: "verifying"}` |
| 11 | Kiểm tra sản phẩm | Xác nhận | `{verified: true, good_streak: 50, rate: 0.004}` |
| 12 | Điều phối | Đóng sự cố; gọi Hành động hoàn thiện 8D/SOP rồi gửi trưởng ca duyệt; phê duyệt của trưởng ca quay về Điều phối; gọi Lưu tri thức | `{status: "closed", pending_approval: "shift_leader"}` |
| 13 | Lưu tri thức | Trả về mục mới cho thư viện lỗi → nguyên nhân và thẻ tác động; Điều phối thêm mục và công bố thẻ | `{impact: {scrap_avoided: 240, downtime_min: 45, kwh: 38, co2_kg: 25}}` |

Ba điểm đáng chú ý trong cách giao tiếp này:

- **Thứ tự có lý do.** Truy vết luôn chạy trước Phân tích cảm biến, vì phải biết nghi phạm là ai mới biết kéo dữ liệu máy nào. Đây chính là cốt lõi của "truy ngược".
- **Vòng lặp thu thập bằng chứng** (bước 7b). Hệ thống không phải pipeline một chiều; khi chưa đủ chắc, nó biết hỏi lại.
- **Đóng sự cố bằng dữ liệu sản phẩm** (bước 10–11), không bằng lời khai.

---

## 5. Hai use case

### Use case 1: Gia công CNC linh kiện ô tô — xước bề mặt → dao mòn

*Nguyên nhân thuộc nhóm Máy móc + Phương pháp.*

**Bối cảnh.** Nhà máy gia công vỏ hộp số nhôm, 3 máy CNC chạy song song, cùng nhận phôi từ một lô nhôm. Ca đêm, kỹ thuật viên trực không phải người quen máy.

**Diễn biến.**

1. 09:40, camera cuối chuyền thấy xước dọc trên mặt A. Trong 20 phút, tỷ lệ lỗi tăng từ 0,5% lên 8%. Agent Điều phối mở sự cố từ tín hiệu gateway/SPC (Agent Kiểm tra sản phẩm phân loại lỗi).
2. Agent Truy vết: 100% sản phẩm lỗi đi qua CNC-02, dao T07. CNC-01 và CNC-03 dùng cùng lô nhôm nhưng không lỗi → loại trừ vật liệu. Nghi phạm: CNC-02 / T07.
3. Agent Phân tích cảm biến: rung trục chính CNC-02 tăng 35% từ 09:30, sớm hơn lỗi sản phẩm 10 phút; dòng điện tăng 12%; nhiệt độ bình thường.
4. Agent Tra cứu tri thức: sổ tay trang 112 (xước dọc + rung tăng = dao mòn); nhật ký bảo trì cho thấy T07 đã cắt 2.400 chi tiết, vượt tuổi thọ 2.000; lịch thay dao hiện tính theo ngày.
5. Agent RCA, độ tin cậy 87%: dao mòn. Gốc rễ: SOP thay dao theo thời gian thay vì theo số chi tiết.
6. Thợ ca đêm nói tiếng Việt qua điện thoại, được hướng dẫn thay insert và kiểm tra độ đảo, mỗi bước kèm trích dẫn sổ tay.
7. Sau sửa, 50 sản phẩm liên tiếp đạt, tỷ lệ lỗi về 0,4% → đóng sự cố.
8. Hệ thống soạn 8D và đề xuất SOP mới: bộ đếm chi tiết tự động nhắc thay dao ở 1.900. Trưởng ca duyệt.

**Thẻ tác động.** Phát hiện sớm hơn 2 giờ so với QC cuối ca → tránh 240 phế phẩm; tiết kiệm 45 phút dừng máy mò nguyên nhân; 38 kWh và khoảng 25 kg CO₂ (năng lượng gia công cộng nấu lại nhôm).

### Use case 2: Ép nhựa vỏ thiết bị điện tử — thiếu liệu ở một lòng khuôn → vật liệu ẩm

*Nguyên nhân thuộc nhóm Vật liệu + Môi trường. Máy ép hoàn toàn bình thường.*

**Bối cảnh.** Máy ép IM-05 chạy khuôn 4 lòng, sản xuất vỏ nhựa ABS. Lúc 14:00, tổ liệu đổi sang lô hạt nhựa mới.

**Diễn biến.**

1. 14:20, camera thấy vết lõm (sink mark) và thiếu liệu, nhưng **chỉ ở sản phẩm từ lòng khuôn số 3**. Agent Điều phối mở sự cố từ tín hiệu gateway/SPC (Agent Kiểm tra sản phẩm phân loại lỗi).
2. Agent Truy vết: lỗi bắt đầu đúng 20 phút sau khi đổi lô liệu. Máy IM-06 bên cạnh vẫn dùng lô cũ, không lỗi. Nghi phạm số 1: lô liệu mới; nghi phạm số 2: lòng khuôn 3.
3. Agent Phân tích cảm biến: áp suất phun, nhiệt chảy, thời gian chu kỳ của IM-05 đều bình thường. Nhưng điểm sương của máy sấy liệu tăng từ −40 °C lên −18 °C từ 13:50.
4. Agent Tra cứu tri thức: sổ tay vật liệu ABS (độ ẩm hạt > 0,02% gây sink mark và thiếu liệu); báo cáo 8D ngày 12/3 có sự cố tương tự, xử lý bằng thay lọc máy sấy; bản vẽ khuôn cho thấy lòng 3 có đường dẫn dài nhất nên nhạy nhất với liệu kém chảy.
5. Agent RCA, độ tin cậy 82%: hạt nhựa lô mới chưa sấy đủ vì lọc máy sấy tắc. Gốc rễ: SOP đổi lô không có bước đo điểm sương.
6. Thợ được hướng dẫn thay lọc và sấy lại liệu 4 giờ. Hệ thống đồng thời soạn phiếu đặt lọc dự phòng.
7. Sau khi chạy lại, 50 sản phẩm liên tiếp đạt ở cả 4 lòng → đóng sự cố.
8. SOP mới: đo điểm sương bắt buộc mỗi lần đổi lô; cảnh báo tự động khi điểm sương > −30 °C.

**Thẻ tác động.** Tránh 600 vỏ nhựa phế (khoảng 18 kg nhựa); 3 giờ máy chạy vô ích; khoảng 45 kWh.

**Vì sao chọn hai use case này.** Một ca truy ngược ra lỗi máy, một ca truy ngược ra lỗi vật liệu và quy trình. Điều đó chứng minh Agent Truy vết và biểu đồ Ishikawa thực sự cần thiết, chứ không phải trang trí: nếu hệ thống chỉ nhìn cảm biến máy ép, use case 2 sẽ không bao giờ được giải.

---

## 6. Vì sao ý tưởng này có cơ hội thắng cao

**Điểm kỹ thuật (40%).** Ý tưởng thể hiện nhiều năng lực AI cùng lúc:

- Nhiều agent phối hợp (multi-agent) với giao thức rõ ràng, có vòng lặp thu thập bằng chứng.
- Xử lý cả hình ảnh sản phẩm, dữ liệu cảm biến, âm thanh, văn bản và video.
- Hội thoại giọng nói thời gian thực qua camera bằng tiếng Việt.
- Kết hợp Gemma chạy tại nhà máy (edge) và Gemini trên cloud.
- Câu trả lời có trích nguồn, không bịa; biết nói "chưa đủ bằng chứng".
- Vòng lặp khép kín: xác nhận bằng dữ liệu sản phẩm; con người phê duyệt.

Nhờ vậy dự án có cơ hội tranh giải phụ Best use of Google Cloud AI tools.

**Tính sáng tạo (25%).** Ở Gen AI Exchange 2025, đội thắng mảng xi măng tập trung tối ưu vận hành nhà máy. Kaizen Agent đi hướng khác: lấy chất lượng sản phẩm làm điểm khởi đầu, phục vụ người công nhân tuyến đầu và giữ lại tri thức. Chủ đề vẫn là sản xuất (ban giám khảo đã chứng tỏ họ thích) nhưng không trùng ý tưởng cũ.

---

## 7. Kịch bản demo (dưới 90 giây)

1. Màn hình hiển thị dây chuyền mô phỏng: 3 máy CNC, trạm camera cuối chuyền, biểu đồ SPC tỷ lệ lỗi đang ở 0,5%.
2. Bấm nút **"Inject defect"**: camera bắt đầu bắt sản phẩm xước, biểu đồ SPC nhảy lên 8%, cảnh báo đỏ.
3. Bảng sự cố hiện lên, từng dòng được điền theo thời gian thực: Truy vết khoanh vùng CNC-02 → biểu đồ rung của **chính máy đó** hiện ra, thấy tăng từ 09:30 → tra sổ tay trang 112 → RCA kết luận "Mòn dao T07, độ tin cậy 87%".
4. Một người cầm điện thoại, nói tiếng Việt vào camera, nhận hướng dẫn thay dao từng bước.
5. Người đó nói "Đã sửa xong". Màn hình hiển thị bộ đếm "Đang xác nhận: 50/50 sản phẩm đạt" → sự cố đóng → báo cáo 8D và thẻ tác động xuất hiện (tránh 240 phế phẩm, 45 phút, 38 kWh, 25 kg CO₂).

Không cần nhà máy thật. Nhóm dựng một dây chuyền ảo phát dữ liệu giả lập từ các bộ dữ liệu công khai bên dưới.

---

## 8. Dữ liệu công khai có thể dùng miễn phí

| Bộ dữ liệu | Nội dung | Dùng cho |
|---|---|---|
| **MVTec AD** | Hàng nghìn ảnh sản phẩm công nghiệp có lỗi và không lỗi, 15 loại vật thể, có nhãn kiểu lỗi | **Dữ liệu trung tâm của demo**: Agent Kiểm tra sản phẩm |
| AI4I 2020, NASA C-MAPSS | Dữ liệu cảm biến máy móc dẫn đến hỏng hóc | Agent Phân tích cảm biến; mô phỏng dữ liệu máy |
| MIMII | Ghi âm tiếng máy bơm, quạt, van lúc bình thường và lúc hỏng | Đường phụ cảnh báo sớm qua âm thanh |
| Sổ tay thiết bị công khai | File PDF hướng dẫn của các hãng máy | Kho tri thức để Agent Tra cứu |
| **Bảng truy vết (nhóm tự sinh)** | product_id → machine_id, tool_id, lot_id, operator, timestamp | Agent Truy vết. Không có bộ công khai nào; nhóm sinh bằng script mô phỏng và nói rõ điều này với giám khảo |

---

## 9. Phát triển sau cuộc thi (tính mở rộng)

**Mô hình kinh doanh.** Phần mềm thuê bao, tính phí theo dây chuyền. Khách hàng đầu tiên là nhà máy vừa và nhỏ, nhà cung cấp linh kiện chưa có MES. Đây là nhóm đông nhất ở Việt Nam và Đông Nam Á, và thường không đủ tiền mua giải pháp của Siemens hay SAP.

**Kết nối máy móc.** Dùng OPC-UA và MQTT, hai chuẩn giao tiếp công nghiệp phổ biến mà hầu hết PLC hiện đại đều hỗ trợ. Với nhà máy chưa có mã truy vết, bắt đầu bằng truy vết theo thời gian + vị trí băng tải, sau nâng cấp lên QR/laser.

**Với nhà máy lớn.** Tích hợp vào Manufacturing Data Engine của Google Cloud và kết nối với MES/QMS sẵn có.

**Lợi thế cạnh tranh tích lũy.** Mỗi sự cố được giải quyết làm thư viện "lỗi → nguyên nhân → cách sửa" dày thêm. Càng nhiều nhà máy dùng, hệ thống chẩn đoán càng chính xác, và đối thủ đến sau rất khó đuổi kịp.
