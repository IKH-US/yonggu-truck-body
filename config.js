/*
  網站設定檔。只需要在這裡填入資料，其他頁面會自動使用。
  留空的項目會自動停用，不會顯示，也不會出現壞掉的連結。
*/
window.WINGKO_CONFIG = {
  businessName: "永固車廂廠",
  privacyReviewed: false, // 私隱政策經業主或法律顧問核對後，改為 true

  // ---- 聯絡資料 ----
  whatsapp: "",  // 國際區號加號碼，只填數字，例如 85291234567
  phone: "",     // 例如 +852 2345 6789
  wechat: "",    // 微信號
  wechatQr: "",  // 微信二維碼圖片路徑，例如 images/wechat-qr.png
  email: "",
  address: "",
  hours: "",     // 例如 星期一至六 09:00-18:00

  // ---- 網址（正式上線後填寫，用於分享預覽及搜尋引擎）----
  siteUrl: "",   // 例如 https://www.example.com

  // ---- 查詢表格收件 ----
  // provider 可選 "netlify"（網站放在 Netlify 時使用）或 "formspree"（需要填 endpoint）。
  // 留空時，表格會改為開啟 WhatsApp、電郵，或複製內容。
  form: {
    provider: "",
    endpoint: ""  // formspree 專用，例如 https://formspree.io/f/xxxxxxxx
  },

  // ---- 流量統計（可選）----
  analytics: {
    plausibleDomain: "",  // 例如 www.example.com
    ga4Id: ""             // 例如 G-XXXXXXXXXX
  },

  // ---- 真實案例（有資料後才會顯示「做過的車廂」區塊）----
  // 每個案例：{ title: "物流運輸", image: "images/cases/case-1.webp", alt: "圖片說明",
  //            vehicle: "車型", size: "貨箱尺寸", setup: "配置" }
  cases: [],

  heroFilm: {
    src: "",
    poster: "images/truck-film-first-frame.webp"
  }
};
