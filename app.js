import { Telegraf, Markup, session } from "telegraf";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID;

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN .env faylida topilmadi!");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

// ==================== DATABASE (Simple JSON) ====================
const DB_FILE = path.join(__dirname, "leads.json");

function loadLeads() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("❌ Ma'lumotlar bazasini yuklashda xato:", e.message);
  }
  return [];
}

function saveLead(leadData) {
  try {
    const leads = loadLeads();
    leads.push({
      ...leadData,
      timestamp: new Date().toISOString(),
      id: leads.length + 1,
    });
    fs.writeFileSync(DB_FILE, JSON.stringify(leads, null, 2), "utf8");
    return true;
  } catch (e) {
    console.error("❌ Ma'lumotni saqlashda xato:", e.message);
    return false;
  }
}

function getStats() {
  const leads = loadLeads();
  const today = new Date().toDateString();
  const todayLeads = leads.filter((l) => new Date(l.timestamp).toDateString() === today);

  return {
    total: leads.length,
    today: todayLeads.length,
    byRole: leads.reduce((acc, l) => {
      acc[l.role] = (acc[l.role] || 0) + 1;
      return acc;
    }, {}),
    byProblem: leads.reduce((acc, l) => {
      acc[l.problem] = (acc[l.problem] || 0) + 1;
      return acc;
    }, {}),
  };
}

// ==================== CONSTANTS ====================
const ROLES = {
  BUSINESS: "1️⃣ Biznes egasi",
  BARBER: "2️⃣ Sartarosh",
  TUTOR: "3️⃣ Onlayn repetitor",
  IT: "4️⃣ Dasturchi / IT",
  SERVICE: "5️⃣ Servis ustasi",
  OTHER: "🔘 Boshqa",
};

const PROBLEMS = {
  CLIENTS: { key: "prob_clients", text: "🚀 Mijozlarni jalb qilish" },
  SALES: { key: "prob_sales", text: "💵 Sotuvni oshirish" },
  BRAND: { key: "prob_brand", text: "🌟 Brendni rivojlantirish" },
  INCOME: { key: "prob_income", text: "📈 Daromadni barqaror qilish" },
  OTHER: { key: "prob_other", text: "🛠 Texnik yordam / Boshqa" },
};

const STEPS = {
  START: 1,
  ROLE_SELECTED: 2,
  PROBLEM_SELECTED: 3,
  CONTACT_SENT: 4,
};

// ==================== KEYBOARDS ====================

const mainMenuKeyboard = Markup.keyboard([
  [ROLES.BUSINESS, ROLES.BARBER],
  [ROLES.TUTOR, ROLES.IT],
  [ROLES.SERVICE, ROLES.OTHER],
  ["💰 Narxlar", "ℹ️ Yordam"],
  ["📊 Portfolio", "🎁 Aksiyalar"],
])
  .resize()
  .persistent();

const problemsKeyboard = Markup.inlineKeyboard([[Markup.button.callback(PROBLEMS.CLIENTS.text, PROBLEMS.CLIENTS.key), Markup.button.callback(PROBLEMS.SALES.text, PROBLEMS.SALES.key)], [Markup.button.callback(PROBLEMS.BRAND.text, PROBLEMS.BRAND.key), Markup.button.callback(PROBLEMS.INCOME.text, PROBLEMS.INCOME.key)], [Markup.button.callback(PROBLEMS.OTHER.text, PROBLEMS.OTHER.key)]]);

const offerActionsKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("📌 Taklifni ko'rish", "offer_view"), Markup.button.callback("❓ Batafsil ma'lumot", "offer_details")],
  [Markup.button.callback("📲 Kontakt yuborish", "send_contact_now"), Markup.button.callback("🔙 Orqaga", "back_to_problems")],
]);

const afterContactKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("📦 Paketlar", "view_packages"), Markup.button.callback("💰 Narxlar", "view_prices")],
  [Markup.button.callback("📊 Portfolio", "view_portfolio"), Markup.button.callback("⭐ Mijozlar fikri", "view_reviews")],
  [Markup.button.callback("📲 Yana kontakt", "send_contact_again"), Markup.button.callback("🏠 Asosiy menyu", "to_main")],
]);

const pricesKeyboard = Markup.inlineKeyboard([[Markup.button.callback("💎 Mini - 500$+", "price_500"), Markup.button.callback("⭐ Standart - 1000$+", "price_1000")], [Markup.button.callback("👑 Premium - 3000$+", "price_3000")], [Markup.button.callback("💰 To'liq narxlar", "price_full"), Markup.button.callback("🔙 Orqaga", "price_back")]]);

const contactRequestKeyboard = Markup.keyboard([[Markup.button.contactRequest("📲 Kontaktni yuborish")], ["🔙 Bekor qilish"]])
  .oneTime()
  .resize();

const adminKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("📊 Statistika", "admin_stats"), Markup.button.callback("📋 Barcha leadlar", "admin_leads")],
  [Markup.button.callback("📥 Export Excel", "admin_export"), Markup.button.callback("🔄 Yangilash", "admin_refresh")],
]);

// ==================== HELPER FUNCTIONS ====================

function initSession(ctx) {
  if (!ctx.session) {
    ctx.session = {
      step: STEPS.START,
      selectedRole: null,
      selectedProblem: null,
      contact: null,
    };
  }
  return ctx.session;
}

function getStepEmoji(step) {
  const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "✅"];
  return emojis[step - 1] || "🔹";
}

function formatHeader(title, step) {
  return `${getStepEmoji(step)} <b>${title}</b>\n\n`;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString("uz-UZ", {
    timeZone: "Asia/Tashkent",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ==================== COMMAND HANDLERS ====================

bot.start(async (ctx) => {
  initSession(ctx);
  ctx.session.step = STEPS.START;

  const firstName = ctx.from.first_name || "Foydalanuvchi";

  const welcomeText = `🎉 <b>Assalomu alaykum, ${firstName}!</b>\n\n` + "Poʻlatjonning <b>Rivoj Bot</b>iga xush kelibsiz! 🚀\n\n" + "Men sizga biznesingizni rivojlantirish, mijozlarni jalb qilish va " + "daromadni oshirishda yordam beraman.\n\n" + "━━━━━━━━━━━━━━━━━━━\n\n" + "🎯 <b>Nima qilaman:</b>\n" + "✔️ Marketing strategiya\n" + "✔️ Mijozlar jalb qilish\n" + "✔️ Brend rivojlantirish\n" + "✔️ Reklama kampaniyalari\n" + "✔️ SMM xizmatlari\n\n" + "━━━━━━━━━━━━━━━━━━━\n\n" + "👇 <b>Quyidagi menyudan o'zingizga mos yo'nalishni tanlang:</b>";

  await ctx.replyWithHTML(welcomeText, mainMenuKeyboard);
});

bot.hears(["🔙 Asosiy menyu", "🏠 Asosiy menyu", "/menu"], async (ctx) => {
  initSession(ctx);
  ctx.session.step = STEPS.START;

  await ctx.replyWithHTML("🏠 <b>Asosiy menyu</b>\n\n" + "Quyidagi yo'nalishlardan birini tanlang:", mainMenuKeyboard);
});

bot.hears(["ℹ️ Yordam", "/help"], async (ctx) => {
  const helpText =
    "📘 <b>BOT BILAN QANDAY ISHLASH:</b>\n\n" +
    "━━━━━━━━━━━━━━━━━━━\n\n" +
    "1️⃣ <b>Kasbingizni tanlang</b>\n" +
    "   Pastdagi tugmalardan o'zingizga mos kasbni tanlang\n\n" +
    "2️⃣ <b>Muammoni belgilang</b>\n" +
    "   Sizni qaysi muammo qiynayotganini ayting\n\n" +
    "3️⃣ <b>Taklifni ko'ring</b>\n" +
    "   Sizga maxsus taklif tayyorlanadi\n\n" +
    "4️⃣ <b>Kontakt yuboring</b>\n" +
    "   Telefon raqamingizni ulashing\n\n" +
    "5️⃣ <b>Biz bog'lanamiz</b>\n" +
    "   2-3 soat ichida mutaxassislar qo'ng'iroq qiladi\n\n" +
    "━━━━━━━━━━━━━━━━━━━\n\n" +
    "🎯 <b>QO'SHIMCHA IMKONIYATLAR:</b>\n\n" +
    "💰 <b>Narxlar</b> - Paketlar va narxlar haqida\n" +
    "📊 <b>Portfolio</b> - Bizning ishlarimiz\n" +
    "🎁 <b>Aksiyalar</b> - Chegirmalar va bonuslar\n" +
    "⭐ <b>Mijozlar fikri</b> - Sharhlar va fikrlar\n\n" +
    "━━━━━━━━━━━━━━━━━━━\n\n" +
    "❓ <b>SAVOL-JAVOBLAR:</b>\n\n" +
    "<b>S:</b> Qancha vaqt kerak bo'ladi?\n" +
    "<b>J:</b> Mini paket 2 hafta, Standart 1 oy, Premium 3 oy\n\n" +
    "<b>S:</b> Natija kafolatlanganmi?\n" +
    "<b>J:</b> Ha, shartnomada belgilanadi\n\n" +
    "<b>S:</b> To'lov qanday?\n" +
    "<b>J:</b> Bosqichma-bosqich yoki to'liq (chegirma bilan)\n\n" +
    "━━━━━━━━━━━━━━━━━━━\n\n" +
    "📞 <b>BOG'LANISH:</b>\n" +
    "Kontakt yuborish tugmasini bosing va biz 2-3 soat ichida siz bilan bog'lanamiz!\n\n" +
    "⚡ <i>Har qanday savollaringiz bo'lsa, kontakt yuboring!</i>";

  await ctx.replyWithHTML(helpText);
});

// Portfolio
bot.hears(["📊 Portfolio", "/portfolio"], async (ctx) => {
  await ctx.sendChatAction("typing");

  const portfolioText =
    "📊 <b>BIZNING PORTFOLIO</b>\n\n" +
    "━━━━━━━━━━━━━━━━━━━\n\n" +
    "🏆 <b>200+ muvaffaqiyatli loyiha</b>\n" +
    "📈 <b>5+ yillik tajriba</b>\n" +
    "⭐ <b>50+ doimiy mijozlar</b>\n\n" +
    "━━━━━━━━━━━━━━━━━━━\n\n" +
    "💼 <b>BIZNING ISHLARIMIZ:</b>\n\n" +
    '🥇 <b>Restoran "Osh Markazi"</b>\n' +
    "• Mijozlar 300% oshdi\n" +
    "• Instagram: 5K → 45K followers\n" +
    "• Oylik daromad 3x ko'paydi\n\n" +
    '🥈 <b>Sartaroshxona "Style Pro"</b>\n' +
    "• 15 ta yangi filial ochildi\n" +
    "• Kunlik mijozlar 20 → 80 ga\n" +
    "• Brend №1 bo'ldi\n\n" +
    '🥉 <b>IT maktabi "CodeLab"</b>\n' +
    "• O'quvchilar soni 5 baravar oshdi\n" +
    "• Onlayn kurslar ishga tushdi\n" +
    "• Daromad $10K/oy ga yetdi\n\n" +
    "━━━━━━━━━━━━━━━━━━━\n\n" +
    "📈 <b>O'RTACHA NATIJALAR:</b>\n\n" +
    "✅ Mijozlar +150-300%\n" +
    "✅ Sotuvlar +50-100%\n" +
    "✅ Daromad 2-5x oshishi\n" +
    "✅ Brend taniqligining oshishi\n" +
    "✅ Social media o'sishi\n\n" +
    "━━━━━━━━━━━━━━━━━━━\n\n" +
    "🎯 <b>SOHALARIMIZDAGI TAJRIBA:</b>\n\n" +
    "• Restoran va kafe 🍽\n" +
    "• Sartaroshxona va go'zallik 💇\n" +
    "• Ta'lim va kurslar 📚\n" +
    "• IT va texnologiya 💻\n" +
    "• Savdo va xizmatlar 🛍\n" +
    "• Tibbiyot va klinikalar 🏥\n" +
    "• Sport va fitnes 🏋️\n" +
    "• Ko'chmas mulk 🏢\n\n" +
    "💡 <i>Sizning soha ham bu ro'yxatda!</i>";

  await ctx.replyWithHTML(portfolioText);

  await new Promise((resolve) => setTimeout(resolve, 1000));
  await ctx.reply("📲 Batafsil portfolio uchun kontakt yuboring!", contactRequestKeyboard);
});

// Aksiyalar
bot.hears(["🎁 Aksiyalar", "/aksiyalar"], async (ctx) => {
  await ctx.sendChatAction("typing");

  const promoText =
    "🎁 <b>MAXSUS AKSIYALAR VA CHEGIRMALAR</b>\n\n" +
    "━━━━━━━━━━━━━━━━━━━\n\n" +
    "🔥 <b>HOZIRGI AKSIYALAR:</b>\n\n" +
    "1️⃣ <b>Birinchi 10 mijoz uchun</b>\n" +
    "   💰 20% chegirma barcha paketlarga\n" +
    "   ⏰ Muddati: 31-oktabr 2025\n" +
    "   🎯 8 ta joy qoldi!\n\n" +
    "2️⃣ <b>To'liq to'lovda</b>\n" +
    "   💰 15% qo'shimcha chegirma\n" +
    "   🎁 + Logo dizayni bepul\n" +
    "   ⏰ Doimiy aksiya\n\n" +
    "3️⃣ <b>Do'stingizni taklif qiling</b>\n" +
    "   💰 Har ikkalangiz 10% chegirma\n" +
    "   🎁 + 2 ta bepul post\n" +
    "   ⏰ Doimiy dastur\n\n" +
    "4️⃣ <b>3 oylik paket olsangiz</b>\n" +
    "   💰 4-chi oy 50% chegirma\n" +
    "   🎁 + Video rolik bepul\n" +
    "   ⏰ Oktabr oyida\n\n" +
    "━━━━━━━━━━━━━━━━━━━\n\n" +
    "🎯 <b>MAXSUS BONUSLAR:</b>\n\n" +
    "✨ Birinchi konsultatsiya - BEPUL\n" +
    "✨ Social media audit - BEPUL\n" +
    "✨ Strategiya dokument - BEPUL\n" +
    "✨ Logo dizayni - 50% chegirma\n" +
    "✨ Landing page - 30% chegirma\n\n" +
    "━━━━━━━━━━━━━━━━━━━\n\n" +
    "💎 <b>VIP MIJOZLAR UCHUN:</b>\n\n" +
    "• Yillik paket - 2 oy bepul\n" +
    "• Shaxsiy menejer - bepul\n" +
    "• Priority qo'llab-quvvatlash\n" +
    "• Maxsus shartlar\n\n" +
    "━━━━━━━━━━━━━━━━━━━\n\n" +
    "⚡ <b>CHEGIRMALARNI BIRLASHTIRING:</b>\n\n" +
    "Misol:\n" +
    "• Mini paket: 500$\n" +
    "• Birinchi 10 mijoz: -20% = 400$\n" +
    "• To'liq to'lov: -15% = 340$\n" +
    "• Jami tejash: 160$ (32%)\n\n" +
    "💡 <i>Chegirmalar cheklangan vaqt uchun!</i>";

  await ctx.replyWithHTML(promoText);

  await new Promise((resolve) => setTimeout(resolve, 1000));
  await ctx.reply("🔥 Chegirmadan foydalanish uchun hoziroq kontakt yuboring!", contactRequestKeyboard);
});

// ==================== ROLE SELECTION ====================

bot.hears(Object.values(ROLES), async (ctx) => {
  initSession(ctx);
  const selectedRole = ctx.message.text;

  ctx.session.selectedRole = selectedRole;
  ctx.session.step = STEPS.ROLE_SELECTED;

  await ctx.sendChatAction("find_location");
  await new Promise((resolve) => setTimeout(resolve, 500));

  const responseText = formatHeader(selectedRole, STEPS.ROLE_SELECTED) + "🎯 <b>Ajoyib tanlov!</b>\n\n" + "Hozir sizni eng ko'p qaysi muammo qiynayotganini aniqlaylik. " + "Bu sizga mos yechim topishimga yordam beradi.\n\n" + "👇 <b>Muammoni tanlang:</b>";

  await ctx.replyWithHTML(responseText, problemsKeyboard);
});

// ==================== PROBLEM SELECTION ====================

bot.action(/^prob_/, async (ctx) => {
  await ctx.answerCbQuery("⏳ Taklif tayyorlanmoqda...");
  initSession(ctx);

  const problemKey = ctx.match.input; // bu yerda 'prob_clients' ni oladi
  const problem = Object.values(PROBLEMS).find((p) => p.key === problemKey);

  if (!problem) {
    console.log("❌ Problem topilmadi:", problemKey);
    return;
  }
  ctx.session.selectedProblem = problem.text;
  ctx.session.step = STEPS.PROBLEM_SELECTED;

  // 1. Tahlil xabari
  const analysisText = "🔍 <b>Tahlil qilinmoqda...</b>\n\n" + `📋 <b>Kasbingiz:</b> ${ctx.session.selectedRole}\n` + `🎯 <b>Muammo:</b> ${problem.text}\n\n` + "⏳ Sizga maxsus yechim tayyorlanmoqda...";

  await ctx.replyWithHTML(analysisText);

  await ctx.sendChatAction("typing");
  await new Promise((resolve) => setTimeout(resolve, 1800));

  // 2. Taklif tayyorlandi
  const offerReadyText = "✅ <b>Maxsus taklif tayyorlandi!</b>\n\n" + `📋 <b>Siz tanladingiz:</b> ${problem.text}\n` + `💼 <b>Kasbingiz:</b> ${ctx.session.selectedRole}\n\n` + "🎯 <b>Sizning muammongizga yechim:</b>\n" + "Men sizning ehtiyojlaringizga mos keladigan maxsus taklif tayyorladim. " + "Bu taklif sizning biznesingizni rivojlantirish va muammolaringizni hal qilishga yordam beradi.\n\n";

  await ctx.replyWithHTML(offerReadyText);

  // 3. PDF yuborish
  await ctx.sendChatAction("upload_document");
  const filePath = path.join(__dirname, "offer.pdf");

  try {
    await ctx.replyWithDocument(
      { source: filePath, filename: `Taklif_${ctx.session.selectedRole.replace(/[^\w]/g, "")}.pdf` },
      {
        caption: "📄 <b>Sizning maxsus taklifingiz</b>\n\n" + "✅ Taklifni yuklab olib diqqat bilan o'qib chiqing.\n" + "✅ Barcha tafsilotlar faylda ko'rsatilgan.\n\n" + "💡 <i>Savollaringiz bo'lsa, pastdagi tugmalardan foydalaning!</i>",
        parse_mode: "HTML",
      }
    );
  } catch (error) {
    console.error("PDF yuklashda xato:", error.message);

    const fullOfferText = "📄 <b>SIZNING MAXSUS TAKLIFINGIZ</b>\n\n" + `🎯 <b>Muammo:</b> ${problem.text}\n` + `💼 <b>Yo'nalish:</b> ${ctx.session.selectedRole}\n\n` + "━━━━━━━━━━━━━━━━━━━\n\n" + "📦 <b>PAKETLAR:</b>\n\n" + "💎 MINI: 500$-900$ | 2 hafta\n" + "⭐ STANDART: 1000$-2500$ | 1 oy\n" + "👑 PREMIUM: 3000$+ | 3 oy\n\n" + "Batafsil ma'lumot uchun tugmalarni bosing! 👇";

    await ctx.replyWithHTML(fullOfferText);
  }

  // 4. Keyingi harakatlar
  await new Promise((resolve) => setTimeout(resolve, 1000));

  await ctx.replyWithHTML("🎯 <b>Keyingi qadam:</b>\n\n" + "👇 Quyidagi tugmalardan foydalaning:", offerActionsKeyboard);
});

// ==================== OFFER ACTIONS ====================

bot.action("offer_view", async (ctx) => {
  await ctx.answerCbQuery("📄 Taklif yuklanmoqda...");

  await ctx.sendChatAction("upload_document");
  const filePath = path.join(__dirname, "offer.pdf");

  try {
    await ctx.replyWithDocument(
      { source: filePath, filename: `Taklif_${ctx.session.selectedRole?.replace(/[^\w]/g, "") || "Umumiy"}.pdf` },
      {
        caption: "📄 <b>Sizning maxsus taklifingiz</b>\n\n" + "✅ Taklifni saqlang va o'qib chiqing\n" + "💡 Savollaringiz bo'lsa, tugmalardan foydalaning",
        parse_mode: "HTML",
      }
    );
  } catch (error) {
    const offerText = "📄 <b>TAKLIFLAR RO'YXATI</b>\n\n" + "💎 Mini - 500$+ | 2 hafta\n" + "⭐ Standart - 1000$+ | 1 oy  \n" + "👑 Premium - 3000$+ | 3 oy\n\n" + "Batafsil: Narxlar tugmasini bosing";

    await ctx.replyWithHTML(offerText);
  }
});

bot.action("offer_details", async (ctx) => {
  await ctx.answerCbQuery("ℹ️ Ma'lumot yuklanmoqda...");

  const detailsText = "ℹ️ <b>BATAFSIL MA'LUMOT</b>\n\n" + `📋 Yo'nalish: ${ctx.session.selectedRole}\n` + `🎯 Muammo: ${ctx.session.selectedProblem}\n\n` + "━━━━━━━━━━━━━━━━━━━\n\n" + "🔥 <b>YONDASHUV:</b>\n\n" + "1️⃣ Chuqur tahlil\n" + "2️⃣ Strategiya yaratish\n" + "3️⃣ Amalga oshirish\n" + "4️⃣ Natijalarni kuzatish\n\n" + "✅ Kafolatlangan natija\n" + "✅ Professional jamoa\n" + "✅ 24/7 qo'llab-quvvatlash";

  await ctx.replyWithHTML(detailsText, contactRequestKeyboard);
});

bot.action("send_contact_now", async (ctx) => {
  await ctx.answerCbQuery("📲 Kontakt yuborish");

  const contactText = "📲 <b>Kontaktingizni yuboring</b>\n\n" + "Quyidagi tugmani bosib telefon raqamingizni ulashing.\n" + "Biz 2-3 soat ichida bog'lanamiz!\n\n" + "🔒 Ma'lumotlar maxfiy saqlanadi.";

  await ctx.replyWithHTML(contactText, contactRequestKeyboard);
});

bot.action("back_to_problems", async (ctx) => {
  await ctx.answerCbQuery("🔙 Orqaga");

  const responseText = formatHeader(ctx.session.selectedRole || "Yo'nalish", STEPS.ROLE_SELECTED) + "Boshqa muammoni tanlang:\n\n" + "👇 <b>Muammoni tanlang:</b>";

  await ctx.replyWithHTML(responseText, problemsKeyboard);
});

// ==================== CONTACT HANDLING ====================

bot.hears("📲 Kontaktni yuborish", async (ctx) => {
  const contactRequestText = "📞 <b>Kontaktingizni yuboring</b>\n\n" + "Quyidagi tugmani bosib, telefon raqamingizni ulashing. " + "Biz 2-3 soat ichida siz bilan bog'lanamiz!\n\n" + "🔒 <i>Ma'lumotlaringiz xavfsiz va maxfiy saqlanadi.</i>";

  await ctx.replyWithHTML(contactRequestText, contactRequestKeyboard);
});

bot.on("contact", async (ctx) => {
  initSession(ctx);

  const contact = ctx.message.contact;
  ctx.session.contact = contact;
  ctx.session.step = STEPS.CONTACT_SENT;

  const firstName = contact.first_name || "Foydalanuvchi";
  const phone = contact.phone_number;

  // Lead saqlash
  const leadData = {
    userId: ctx.from.id,
    username: ctx.from.username || null,
    firstName: firstName,
    phone: phone,
    role: ctx.session.selectedRole || "Noma'lum",
    problem: ctx.session.selectedProblem || "Noma'lum",
  };

  saveLead(leadData);

  // 1. Rahmat xabari (animation)
  await ctx.sendChatAction("typing");
  await new Promise((resolve) => setTimeout(resolve, 800));

  const thankYouText = `✅ <b>Ajoyib, ${firstName}!</b>\n\n` + `📞 Telefon raqamingiz qabul qilindi:\n<code>${phone}</code>\n\n` + "⏰ <b>Keyingi 2-3 soat ichida</b> bizning mutaxassislarimiz siz bilan bog'lanadi!\n\n" + "🎯 Biz siz bilan:\n" + "• Muammolaringizni muhokama qilamiz\n" + "• Eng mos yechimni taklif qilamiz\n" + "• Maxsus narx va shartlarni kelishamiz\n" + "• Barcha savollaringizga javob beramiz";

  await ctx.replyWithHTML(thankYouText);

  // 2. Qo'shimcha ma'lumot
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await ctx.sendChatAction("typing");

  const additionalText = "━━━━━━━━━━━━━━━━━━━\n\n" + "🔥 <b>SIZ UCHUN MAXSUS IMKONIYATLAR:</b>\n\n" + "✔️ <b>Tezkor natija</b>\n" + "   Birinchi natijalarni 1-2 haftada ko'rasiz\n\n" + "✔️ <b>Mutaxassis yondashuvi</b>\n" + "   Tajribali marketing jamoasi bilan ishlash\n\n" + "✔️ <b>Shaxsiy yordam</b>\n" + "   Sizga maxsus menejer biriktiriladi\n\n" + "✔️ <b>Kafolatlangan sifat</b>\n" + "   Shartnomaga asoslangan ishlash\n\n" + "✔️ <b>To'liq qo'llab-quvvatlash</b>\n" + "   24/7 aloqada bo'lamiz\n\n" + "━━━━━━━━━━━━━━━━━━━\n\n" + "🎁 <b>MAXSUS BONUSLAR:</b>\n" + "• Birinchi konsultatsiya bepul\n" + "• Social media audit bepul\n" + "• Logo dizayni 50% chegirma\n" + "• Birinchi 10 mijozga 20% chegirma\n\n" + "💡 <i>Quyidagi tugmalardan qo'shimcha ma'lumot olishingiz mumkin!</i>";

  await ctx.replyWithHTML(additionalText, afterContactKeyboard);

  // 3. Asosiy menyuni qayta ko'rsatish
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await ctx.reply("━━━━━━━━━━━━━━━━━━━\n\n" + "🏠 <b>Asosiy menyu</b>\n\n" + "Qo'shimcha xizmatlar va ma'lumot uchun quyidagi menyudan foydalaning:", { parse_mode: "HTML", ...mainMenuKeyboard });

  // 4. Admin uchun bildirishnoma
  if (ADMIN_ID) {
    const adminNotification = "🔔 <b>YANGI LEAD QABUL QILINDI!</b>\n\n" + "━━━━━━━━━━━━━━━━━━━\n\n" + "👤 <b>Mijoz ma'lumotlari:</b>\n\n" + `• Ism: <b>${firstName}</b>\n` + `• Telefon: <code>${phone}</code>\n` + `• User ID: <code>${ctx.from.id}</code>\n` + `• Username: ${ctx.from.username ? "@" + ctx.from.username : "❌ Yo'q"}\n\n` + "━━━━━━━━━━━━━━━━━━━\n\n" + "📊 <b>Tanlangan parametrlar:</b>\n\n" + `💼 Kasb: <b>${ctx.session.selectedRole || "❌ Ko'rsatilmagan"}</b>\n` + `🎯 Muammo: <b>${ctx.session.selectedProblem || "❌ Ko'rsatilmagan"}</b>\n\n` + "━━━━━━━━━━━━━━━━━━━\n\n" + `⏰ Vaqt: ${formatDate(new Date().toISOString())}\n\n` + "⚡ <b>Tez bog'lanish tavsiya etiladi!</b>";

    try {
      await ctx.telegram.sendMessage(ADMIN_ID, adminNotification, { parse_mode: "HTML" });
    } catch (e) {
      console.error("❌ Admin ID ga xabar yuborishda xato:", e.message);
    }
  }
});

bot.hears("🔙 Bekor qilish", async (ctx) => {
  await ctx.reply("❌ Kontakt yuborish bekor qilindi.\n\nAsosiy menyudan davom eting.", mainMenuKeyboard);
});

// ==================== AFTER CONTACT ACTIONS ====================

bot.action("view_packages", async (ctx) => {
  await ctx.answerCbQuery("📦 Paketlar yuklanmoqda...");

  const packagesText =
    "📦 <b>BIZNING PAKETLARIMIZ</b>\n\n" +
    "━━━━━━━━━━━━━━━━━━━\n\n" +
    "💎 <b>1. MINI PAKET</b>\n\n" +
    "⏱ Muddat: 2 hafta\n" +
    "💵 Narx: 500$ - 900$\n\n" +
    "<b>Xizmatlar:</b>\n" +
    "✔️ Biznes tahlili\n" +
    "✔️ Raqobatchilar tahlili\n" +
    "✔️ Tezkor marketing strategiya\n" +
    "✔️ 2 ta professional kontent\n" +
    "✔️ Asosiy qo'llab-quvvatlash\n\n" +
    "<b>Natija:</b>\n" +
    "📈 Sotuvning 15-25% oshishi\n" +
    "🎯 Yangi mijozlar oqimi\n\n" +
    "━━━━━━━━━━━━━━━━━━━\n\n" +
    "⭐ <b>2. STANDART PAKET</b> 🔥 <i>Mashhur</i>\n\n" +
    "⏱ Muddat: 1 oy\n" +
    "💵 Narx: 1000$ - 2500$\n\n" +
    "<b>Xizmatlar:</b>\n" +
    "✔️ To'liq marketing strategiya\n" +
    "✔️ Auditoriya tahlili\n" +
    "✔️ 4 ta premium kontent\n" +
    "✔️ Reklama kampaniyasi\n" +
    "✔️ Haftalik konsultatsiya\n" +
    "✔️ Analitika hisobotlari\n\n" +
    "<b>Natija:</b>\n" +
    "📈 Sotuvning 30-50% oshishi\n" +
    "🎯 Barqaror mijozlar bazasi\n" +
    "💰 Daromadning 2x o'sishi\n\n" +
    "━━━━━━━━━━━━━━━━━━━\n\n" +
    "👑 <b>3. PREMIUM PAKET</b> ⭐ <i>VIP</i>\n\n" +
    "⏱ Muddat: 3 oy\n" +
    "💵 Narx: 3000$+\n\n" +
    "<b>Xizmatlar:</b>\n" +
    "✔️ Kompleks brend strategiya\n" +
    "✔️ To'liq raqamli marketing\n" +
    "✔️ 12 ta eksklyuziv kontent\n" +
    "✔️ Reklama boshqarish\n" +
    "✔️ SMM va targetolog\n" +
    "✔️ Doimiy konsultatsiya 24/7\n" +
    "✔️ Shaxsiy menejer\n\n" +
    "<b>Natija:</b>\n" +
    "📈 Sotuvning 60-100% oshishi\n" +
    "🎯 Premium mijozlar\n" +
    "💰 Daromadning 3-5x o'sishi\n" +
    "🏆 Bozorda lider pozitsiya\n\n" +
    "━━━━━━━━━━━━━━━━━━━\n\n" +
    "🎁 <b>BONUSLAR:</b>\n" +
    "✨ Birinchi 10 ta mijozga 20% chegirma\n" +
    "✨ Bepul konsultatsiya\n" +
    "✨ Logo dizayn 50% off\n\n" +
    "💡 <i>Har bir paket sizga moslashtiriladi!</i>";

  await ctx.replyWithHTML(packagesText);

  await new Promise((resolve) => setTimeout(resolve, 1000));
  await ctx.reply("👇 Keyingi qadam:", afterContactKeyboard);
});

bot.action("view_prices", async (ctx) => {
  await ctx.answerCbQuery("💰 Narxlar");
  await ctx.reply("💰 Narx diapazonini tanlang:", pricesKeyboard);
});

bot.action("view_portfolio", async (ctx) => {
  await ctx.answerCbQuery("📊 Portfolio");

  const portfolioText = "📊 <b>PORTFOLIO</b>\n\n" + "🏆 200+ loyiha\n" + "⭐ 5+ yil tajriba\n" + "💼 50+ doimiy mijoz\n\n" + "━━━━━━━━━━━━━━━━━━━\n\n" + "<b>Muvaffaqiyatli loyihalar:</b>\n\n" + "• Restoran: Mijozlar 300% ↑\n" + "• Sartaroshxona: 15 filial ochildi\n" + "• IT maktab: Daromad $10K/oy\n" + "• Online do'kon: Sotuvlar 5x\n\n" + "Batafsil: /portfolio";

  await ctx.replyWithHTML(portfolioText);
});

bot.action("view_reviews", async (ctx) => {
  await ctx.answerCbQuery("⭐ Sharhlar");

  const reviewsText = "⭐⭐⭐⭐⭐ <b>MIJOZLAR FIKRI</b>\n\n" + "━━━━━━━━━━━━━━━━━━━\n\n" + "👤 <b>Jamshid - Restoran egasi</b>\n" + "\"3 oy ichida mijozlarim 4 barobar ko'paydi! " + 'Professional jamoa va ajoyib natija."\n' + "⭐⭐⭐⭐⭐\n\n" + "👤 <b>Dilnoza - Sartaroshxona</b>\n" + '"Haqiqiy mutaxassislar! Instagram sahifam ' + "5K dan 45K ga o'sdi. Rahmat!\"\n" + "⭐⭐⭐⭐⭐\n\n" + "👤 <b>Sardor - IT maktab</b>\n" + "\"Eng yaxshi investitsiya edi. O'quvchilar " + 'soni 5 barobar oshdi, daromad ham!"\n' + "⭐⭐⭐⭐⭐\n\n" + "👤 <b>Madina - Online do'kon</b>\n" + "\"Sotuvlarim 500% o'sdi! Shaxsiy menejer " + 'doimo yordam berdi. Tavsiya qilaman!"\n' + "⭐⭐⭐⭐⭐\n\n" + "━━━━━━━━━━━━━━━━━━━\n\n" + "📊 <b>O'rtacha baho: 4.9/5</b>\n" + "👥 <b>200+ mamnun mijoz</b>\n\n" + "💡 <i>Siz ham muvaffaqiyatli bo'ling!</i>";

  await ctx.replyWithHTML(reviewsText);
});

bot.action("send_contact_again", async (ctx) => {
  await ctx.answerCbQuery("📲 Kontakt");

  const contactRequestText = "📲 <b>Kontaktingizni qayta yuboring</b>\n\n" + "Tugmani bosing:";

  await ctx.replyWithHTML(contactRequestText, contactRequestKeyboard);
});

bot.action("to_main", async (ctx) => {
  await ctx.answerCbQuery("🏠 Asosiy menyu");
  ctx.session.step = STEPS.START;

  await ctx.reply("🏠 Asosiy menyu", mainMenuKeyboard);
});

// ==================== PRICES HANDLERS ====================

bot.hears("💰 Narxlar", async (ctx) => {
  await ctx.reply("💰 <b>Narxlar bo'yicha ma'lumot:</b>\n\n" + "Diapazondan tanlang:", { parse_mode: "HTML", ...pricesKeyboard });
});

bot.action(["price_500", "price_1000", "price_3000"], async (ctx) => {
  await ctx.answerCbQuery("💰 Narx ma'lumotlari");

  const priceInfo = {
    price_500: {
      text: "💎 <b>MINI PAKET: 500$ - 900$</b>\n\n" + "⏱ Muddat: 2 hafta\n\n" + "<b>To'liq xizmatlar:</b>\n" + "✔️ Biznes va bozor tahlili\n" + "✔️ Raqobatchilar tahlili\n" + "✔️ Marketing strategiya\n" + "✔️ 2 ta professional kontent\n" + "✔️ Social media sozlash\n" + "✔️ Bepul konsultatsiya\n\n" + "<b>Natija:</b>\n" + "📈 Sotuvning 15-25% ↑\n" + "🎯 50-100 yangi mijoz\n" + "💰 Daromadning 20-30% ↑\n\n" + "🎁 <b>Chegirma:</b> 25% birinchi 5 mijozga\n" + "💵 Final narx: <b>375$ - 675$</b>",
    },
    price_1000: {
      text: "⭐ <b>STANDART PAKET: 1000$ - 2500$</b>\n\n" + "⏱ Muddat: 1 oy\n\n" + "<b>To'liq xizmatlar:</b>\n" + "✔️ Chuqur bozor tahlili\n" + "✔️ To'liq marketing strategiya\n" + "✔️ Auditoriya segmentatsiyasi\n" + "✔️ 4 ta premium kontent\n" + "✔️ 2 ta reklama kampaniyasi\n" + "✔️ Haftalik konsultatsiya (8 soat)\n" + "✔️ SMM strategiya\n" + "✔️ Email marketing\n" + "✔️ Haftalik hisobotlar\n\n" + "<b>Natija:</b>\n" + "📈 Sotuvning 30-50% ↑\n" + "🎯 200-500 yangi mijoz\n" + "💰 Daromadning 2x ↑\n" + "🌟 Brend taniqligining ↑\n\n" + "🎁 <b>Bonuslar:</b>\n" + "• Logo dizayn 50% off\n" + "• Landing page 30% off\n" + "• SEO audit bepul\n\n" + "💵 Chegirma: <b>800$ - 2000$</b>",
    },
    price_3000: {
      text: "👑 <b>PREMIUM PAKET: 3000$+</b>\n\n" + "⏱ Muddat: 3 oy\n\n" + "<b>VIP xizmatlar:</b>\n" + "✔️ Kompleks brend strategiya\n" + "✔️ 360° raqamli marketing\n" + "✔️ 12 ta eksklyuziv kontent\n" + "✔️ 6 ta reklama kampaniyasi\n" + "✔️ To'liq SMM boshqarish\n" + "✔️ Targetolog xizmatlari\n" + "✔️ 24/7 konsultatsiya\n" + "✔️ Email marketing\n" + "✔️ Influencer marketing\n" + "✔️ SEO optimizatsiya\n" + "✔️ Shaxsiy menejer\n" + "✔️ Crisis management\n\n" + "<b>Natija:</b>\n" + "📈 Sotuvning 60-100%+ ↑\n" + "🎯 500-1000+ premium mijoz\n" + "💰 Daromadning 3-5x ↑\n" + "🏆 Bozorda №1 pozitsiya\n\n" + "🎁 <b>VIP bonuslar:</b>\n" + "• Logo va brend identifikatsiya\n" + "• Website yaratish\n" + "• Fotosessiya\n" + "• Video roliklar (2 ta)\n" + "• Chatbot yaratish\n" + "• CRM integratsiya\n\n" + "💵 Chegirma: <b>2250$+</b>",
    },
  };

  const selected = priceInfo[ctx.match[0]];
  await ctx.replyWithHTML(selected.text);

  await new Promise((resolve) => setTimeout(resolve, 1000));
  await ctx.replyWithHTML("📞 <b>Xizmatdan foydalanish uchun:</b>\n\n" + "Kontakt yuboring va biz sizga:\n" + "✅ 2 soat ichida javob beramiz\n" + "✅ Bepul konsultatsiya\n" + "✅ Maxsus narx taklif qilamiz\n\n" + "⚡ Chegirmalar cheklangan!", afterContactKeyboard);
});

bot.action("price_full", async (ctx) => {
  await ctx.answerCbQuery("💰 To'liq narxlar");

  const fullPricesText =
    "💰 <b>TO'LIQ NARXLAR RO'YXATI</b>\n\n" + "━━━━━━━━━━━━━━━━━━━\n\n" + "💎 <b>MINI PAKET</b>\n" + "Narx: 500$ - 900$\n" + "Chegirma: 375$ - 675$\n" + "Muddat: 2 hafta\n\n" + "⭐ <b>STANDART PAKET</b>\n" + "Narx: 1000$ - 2500$\n" + "Chegirma: 800$ - 2000$\n" + "Muddat: 1 oy\n\n" + "👑 <b>PREMIUM PAKET</b>\n" + "Narx: 3000$+\n" + "Chegirma: 2250$+\n" + "Muddat: 3 oy\n\n" + "━━━━━━━━━━━━━━━━━━━\n\n" + "🎁 <b>QO'SHIMCHA XIZMATLAR:</b>\n\n" + "• Logo dizayn: 200$ - 500$\n" + "• Landing page: 300$ - 800$\n" + "• Video rolik: 150$ - 400$\n" + "• Fotosessiya: 100$ - 300$\n" + "• Chatbot: 200$ - 600$\n" + "• SEO: 400$ - 1000$/oy\n\n" + "━━━━━━━━━━━━━━━━━━━\n\n" + "💡 <b>TO'LOV SHARTLARI:</b>\n\n" + "1️⃣ Bosqichma-bosqich to'lov\n" + "   • 50% oldindan\n" + "   • 50% natija ko'rsatilganda\n\n" + "2️⃣ To'liq to'lov\n" + "   • 15% qo'shimcha chegirma\n\n" + "3️⃣ Oylik to'lov\n" + "   • Premium paket uchun\n\n" + "━━━━━━━━━━━━━━━━━━━\n\n" + "📞 Aniq narx uchun kontakt yuboring!";

  await ctx.replyWithHTML(fullPricesText);
});

bot.action("price_back", async (ctx) => {
  await ctx.answerCbQuery("🔙 Orqaga");
  await ctx.reply("🏠 Asosiy menyu", mainMenuKeyboard);
});

// ==================== ADMIN COMMANDS ====================

bot.command("admin", async (ctx) => {
  if (!ADMIN_ID || ctx.from.id.toString() !== ADMIN_ID.toString()) {
    return ctx.reply("❌ Sizda admin huquqi yo'q!");
  }

  await ctx.reply("🔐 <b>ADMIN PANEL</b>\n\n" + "Admin funksiyalarini tanlang:", { parse_mode: "HTML", ...adminKeyboard });
});

bot.action("admin_stats", async (ctx) => {
  if (!ADMIN_ID || ctx.from.id.toString() !== ADMIN_ID.toString()) {
    return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  }

  await ctx.answerCbQuery("📊 Statistika yuklanmoqda...");

  const stats = getStats();

  const roleStats = Object.entries(stats.byRole)
    .map(([role, count]) => `  • ${role}: ${count}`)
    .join("\n");

  const problemStats = Object.entries(stats.byProblem)
    .map(([problem, count]) => `  • ${problem}: ${count}`)
    .join("\n");

  const statsText = "📊 <b>BOT STATISTIKASI</b>\n\n" + "━━━━━━━━━━━━━━━━━━━\n\n" + `📈 <b>Jami leadlar:</b> ${stats.total}\n` + `🆕 <b>Bugun:</b> ${stats.today}\n\n` + "━━━━━━━━━━━━━━━━━━━\n\n" + "👥 <b>Kasblar bo'yicha:</b>\n" + `${roleStats || "  Ma'lumot yo'q"}\n\n` + "━━━━━━━━━━━━━━━━━━━\n\n" + "🎯 <b>Muammolar bo'yicha:</b>\n" + `${problemStats || "  Ma'lumot yo'q"}\n\n` + "━━━━━━━━━━━━━━━━━━━\n\n" + `⏰ Yangilangan: ${formatDate(new Date().toISOString())}`;

  await ctx.replyWithHTML(statsText, adminKeyboard);
});

bot.action("admin_leads", async (ctx) => {
  if (!ADMIN_ID || ctx.from.id.toString() !== ADMIN_ID.toString()) {
    return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  }

  await ctx.answerCbQuery("📋 Leadlar yuklanmoqda...");

  const leads = loadLeads();
  const recentLeads = leads.slice(-10).reverse();

  if (recentLeads.length === 0) {
    return ctx.reply("📋 Hozircha leadlar yo'q.");
  }

  let leadsText = "📋 <b>SO'NGGI 10 TA LEAD</b>\n\n";

  recentLeads.forEach((lead, index) => {
    leadsText += `━━━━━━━━━━━━━━━━━━━\n\n` + `${index + 1}. <b>${lead.firstName}</b>\n` + `📞 ${lead.phone}\n` + `💼 ${lead.role}\n` + `🎯 ${lead.problem}\n` + `⏰ ${formatDate(lead.timestamp)}\n\n`;
  });

  await ctx.replyWithHTML(leadsText, adminKeyboard);
});

bot.action("admin_export", async (ctx) => {
  if (!ADMIN_ID || ctx.from.id.toString() !== ADMIN_ID.toString()) {
    return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  }

  await ctx.answerCbQuery("📥 Export qilinmoqda...");

  const leads = loadLeads();

  if (leads.length === 0) {
    return ctx.reply("📋 Export qilish uchun ma'lumot yo'q.");
  }

  // CSV formatda export
  let csvContent = "ID,Ism,Telefon,Kasb,Muammo,Vaqt,User_ID,Username\n";

  leads.forEach((lead) => {
    csvContent += `${lead.id},` + `"${lead.firstName}",` + `"${lead.phone}",` + `"${lead.role}",` + `"${lead.problem}",` + `"${formatDate(lead.timestamp)}",` + `${lead.userId},` + `"${lead.username || "Yo'q"}"\n`;
  });

  const filename = `leads_${new Date().toISOString().split("T")[0]}.csv`;
  const filepath = path.join(__dirname, filename);

  try {
    fs.writeFileSync(filepath, csvContent, "utf8");

    await ctx.replyWithDocument(
      { source: filepath, filename: filename },
      {
        caption: `📥 <b>Leadlar export qilindi</b>\n\n` + `📊 Jami: ${leads.length} ta\n` + `📅 Sana: ${new Date().toLocaleDateString("uz-UZ")}\n\n` + `💡 Faylni Excel yoki Google Sheets da oching.`,
        parse_mode: "HTML",
      }
    );

    // Faylni o'chirish
    fs.unlinkSync(filepath);
  } catch (error) {
    console.error("Export xatosi:", error);
    await ctx.reply("❌ Export qilishda xatolik yuz berdi.");
  }
});

bot.action("admin_refresh", async (ctx) => {
  if (!ADMIN_ID || ctx.from.id.toString() !== ADMIN_ID.toString()) {
    return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  }

  await ctx.answerCbQuery("🔄 Yangilanmoqda...");

  const stats = getStats();

  await ctx.reply("✅ <b>Statistika yangilandi!</b>\n\n" + `📈 Jami leadlar: ${stats.total}\n` + `🆕 Bugun: ${stats.today}\n\n` + `⏰ ${formatDate(new Date().toISOString())}`, { parse_mode: "HTML", ...adminKeyboard });
});

// ==================== BROADCAST (Admin only) ====================

bot.command("broadcast", async (ctx) => {
  if (!ADMIN_ID || ctx.from.id.toString() !== ADMIN_ID.toString()) {
    return ctx.reply("❌ Sizda admin huquqi yo'q!");
  }

  const message = ctx.message.text.replace("/broadcast", "").trim();

  if (!message) {
    return ctx.reply("📢 <b>Broadcast yuborish:</b>\n\n" + "Foydalanish: /broadcast [xabar]\n\n" + "Misol:\n" + "<code>/broadcast Yangi aksiya boshlanadi!</code>", { parse_mode: "HTML" });
  }

  const leads = loadLeads();
  const userIds = [...new Set(leads.map((l) => l.userId))];

  let successCount = 0;
  let failCount = 0;

  await ctx.reply(`📢 Broadcast boshlanmoqda... (${userIds.length} foydalanuvchi)`);

  for (const userId of userIds) {
    try {
      await ctx.telegram.sendMessage(userId, message, { parse_mode: "HTML" });
      successCount++;
      await new Promise((resolve) => setTimeout(resolve, 100)); // Rate limit
    } catch (error) {
      failCount++;
      console.error(`Xabar yuborishda xato (${userId}):`, error.message);
    }
  }

  await ctx.reply(`✅ <b>Broadcast yakunlandi!</b>\n\n` + `✅ Muvaffaqiyatli: ${successCount}\n` + `❌ Xatolik: ${failCount}\n` + `📊 Jami: ${userIds.length}`, { parse_mode: "HTML" });
});

// ==================== FALLBACK TEXT HANDLER ====================

bot.on("text", async (ctx) => {
  initSession(ctx);
  const text = ctx.message.text.toLowerCase();

  // Oddiy kalit so'zlar
  if (text.includes("narx") || text.includes("price") || text.includes("pul")) {
    return ctx.reply("💰 Narxlar bo'limiga o'ting:", pricesKeyboard);
  }

  if (text.includes("taklif") || text.includes("offer")) {
    return ctx.replyWithHTML("📋 Taklif olish uchun:\n" + "1. Kasbingizni tanlang\n" + "2. Muammoingizni belgilang\n\n" + "Asosiy menyudan boshlang 👇", mainMenuKeyboard);
  }

  if (text.includes("yordam") || text.includes("help")) {
    return ctx.reply("ℹ️ Yordam", mainMenuKeyboard);
  }

  if (text.includes("portfolio") || text.includes("ish")) {
    return ctx.reply("📊 Portfolio", mainMenuKeyboard);
  }

  if (text.includes("aksiya") || text.includes("chegirma") || text.includes("bonus")) {
    return ctx.reply("🎁 Aksiyalar", mainMenuKeyboard);
  }

  if (text.includes("kontakt") || text.includes("telefon") || text.includes("raqam")) {
    return ctx.replyWithHTML("📲 Kontaktingizni yuboring:", contactRequestKeyboard);
  }

  // Standart javob
  await ctx.replyWithHTML("🤔 <b>Tushunmadim...</b>\n\n" + "Quyidagi menyudan tanlang yoki:\n" + "• /help - Yordam\n" + "• /start - Boshlash\n" + "• /menu - Asosiy menyu", mainMenuKeyboard);
});

// ==================== ERROR HANDLING ====================

bot.catch((err, ctx) => {
  console.error("❌ Bot xatosi:", err);
  console.error("Update:", ctx.update);

  try {
    ctx.reply("⚠️ <b>Xatolik yuz berdi</b>\n\n" + "Iltimos, qaytadan urinib ko'ring yoki /start buyrug'ini yozing.\n\n" + "Muammo davom etsa, kontaktingizni yuboring - biz yordam beramiz!", { parse_mode: "HTML", ...mainMenuKeyboard }).catch(() => {});
  } catch (e) {
    console.error("Error handler xatosi:", e);
  }
});

// ==================== MIDDLEWARE: Logging ====================

bot.use(async (ctx, next) => {
  const start = Date.now();
  const user = ctx.from;

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📨 Yangi update:
👤 User: ${user?.first_name} (@${user?.username || "no_username"})
🆔 ID: ${user?.id}
💬 Type: ${ctx.updateType}
📝 Text: ${ctx.message?.text || ctx.callbackQuery?.data || "N/A"}
⏰ Vaqt: ${new Date().toLocaleString("uz-UZ")}
  `);

  try {
    await next();
    const ms = Date.now() - start;
    console.log(`✅ Processed in ${ms}ms`);
  } catch (error) {
    console.error("❌ Middleware xatosi:", error);
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
});

// ==================== LAUNCH ====================

console.log("🚀 Bot ishga tushirilmoqda...\n");

bot
  .launch({
    dropPendingUpdates: true,
  })
  .then(() => {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ Rivoj Bot muvaffaqiyatli ishga tushdi!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`📅 Sana: ${new Date().toLocaleDateString("uz-UZ")}`);
    console.log(`⏰ Vaqt: ${new Date().toLocaleTimeString("uz-UZ")}`);
    console.log(`🤖 Bot ID: @${bot.botInfo.username}`);
    console.log(`👤 Bot nomi: ${bot.botInfo.first_name}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📊 Ma'lumotlar bazasi: leads.json");
    console.log(`📈 Jami leadlar: ${loadLeads().length}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔄 Bot ishlashda...\n");

    // Admin uchun bildirishnoma
    if (ADMIN_ID) {
      bot.telegram.sendMessage(ADMIN_ID, "🚀 <b>Bot ishga tushdi!</b>\n\n" + `⏰ Vaqt: ${new Date().toLocaleString("uz-UZ")}\n` + `📊 Jami leadlar: ${loadLeads().length}\n\n` + "✅ Bot normal ishlayapti.", { parse_mode: "HTML" }).catch(() => {});
    }
  })
  .catch((err) => {
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("❌ Botni ishga tushirishda XATO:");
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error(err);
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    process.exit(1);
  });

// ==================== GRACEFUL SHUTDOWN ====================

const gracefulShutdown = (signal) => {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`⚠️  ${signal} signal qabul qilindi`);
  console.log("🛑 Bot to'xtatilmoqda...");

  bot.stop(signal);

  console.log("✅ Bot to'xtatildi");
  console.log(`⏰ Vaqt: ${new Date().toLocaleString("uz-UZ")}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Admin uchun bildirishnoma
  if (ADMIN_ID) {
    bot.telegram
      .sendMessage(ADMIN_ID, `⚠️ <b>Bot to'xtatildi</b>\n\n` + `📅 ${new Date().toLocaleString("uz-UZ")}\n` + `🔄 Signal: ${signal}`, { parse_mode: "HTML" })
      .catch(() => {})
      .finally(() => {
        process.exit(0);
      });
  } else {
    process.exit(0);
  }
};

process.once("SIGINT", () => gracefulShutdown("SIGINT"));
process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.error("❌ UNCAUGHT EXCEPTION:");
  console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.error(error);
  console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  if (ADMIN_ID) {
    bot.telegram
      .sendMessage(ADMIN_ID, `❌ <b>Bot xatosi!</b>\n\n` + `<code>${error.message}</code>\n\n` + `⏰ ${new Date().toLocaleString("uz-UZ")}`, { parse_mode: "HTML" })
      .catch(() => {})
      .finally(() => {
        process.exit(1);
      });
  } else {
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.error("❌ UNHANDLED REJECTION:");
  console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.error("Reason:", reason);
  console.error("Promise:", promise);
  console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
});

// ==================== HEALTH CHECK ====================

// Har 5 daqiqada bot ishlayotganligini tekshirish
setInterval(() => {
  const stats = getStats();
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💚 Health Check
⏰ Vaqt: ${new Date().toLocaleString("uz-UZ")}
📊 Jami leadlar: ${stats.total}
🆕 Bugungi leadlar: ${stats.today}
✅ Status: Online
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
}, 5 * 60 * 1000);

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("🎯 Bot jarayoni boshlandi");
console.log("📝 Loglar faol");
console.log("💾 Ma'lumotlar bazasi ulandi");
console.log("⚡ Barcha funksiyalar faol");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
