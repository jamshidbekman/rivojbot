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
const GROUP_ID = process.env.GROUP_ID;

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN .env faylida topilmadi!");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

// ==================== DATABASE ====================
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

// ==================== KEYBOARDS ====================

const mainMenuKeyboard = Markup.keyboard([
  [ROLES.BUSINESS, ROLES.BARBER],
  [ROLES.TUTOR, ROLES.IT],
  [ROLES.SERVICE, ROLES.OTHER],
  ["💰 Narxlar", "ℹ️ Yordam"],
])
  .resize()
  .persistent();

const problemsKeyboard = Markup.inlineKeyboard([[Markup.button.callback(PROBLEMS.CLIENTS.text, PROBLEMS.CLIENTS.key), Markup.button.callback(PROBLEMS.SALES.text, PROBLEMS.SALES.key)], [Markup.button.callback(PROBLEMS.BRAND.text, PROBLEMS.BRAND.key), Markup.button.callback(PROBLEMS.INCOME.text, PROBLEMS.INCOME.key)], [Markup.button.callback(PROBLEMS.OTHER.text, PROBLEMS.OTHER.key)]]);

const offerActionsKeyboard = Markup.inlineKeyboard([[Markup.button.callback("📌 Taklifni ko'rish", "offer_view"), Markup.button.callback("❓ Batafsil ma'lumot", "offer_details")], [Markup.button.callback("🔙 Orqaga", "back_to_problems")]]);

const contactRequestKeyboard = Markup.keyboard([[Markup.button.contactRequest("📲 Kontaktni yuborish")], ["🔙 Asosiy menyu"]])
  .oneTime()
  .resize();

const pricesKeyboard = Markup.inlineKeyboard([[Markup.button.callback("💎 Mini - 50$+", "price_50"), Markup.button.callback("⭐ Standart - 100$+", "price_100")], [Markup.button.callback("👑 Premium - 300$+", "price_300")], [Markup.button.callback("🔙 Orqaga", "price_back")]]);

const adminKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("📊 Statistika", "admin_stats"), Markup.button.callback("📋 Barcha leadlar", "admin_leads")],
  [Markup.button.callback("📥 Export CSV", "admin_export"), Markup.button.callback("🔄 Yangilash", "admin_refresh")],
]);

// ==================== HELPER FUNCTIONS ====================

function initSession(ctx) {
  if (!ctx.session) {
    ctx.session = {
      selectedRole: null,
      selectedProblem: null,
      contact: null,
      offerShown: false,
    };
  }
  return ctx.session;
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

// ==================== START COMMAND ====================

bot.start(async (ctx) => {
  initSession(ctx);
  const firstName = ctx.from.first_name || "Foydalanuvchi";

  const welcomeText = `🎉 <b>Assalomu alaykum, ${firstName}!</b>\n\n` + "Poʻlatjonning <b>Rivoj Bot</b>iga xush kelibsiz! 🚀\n\n" + "Men sizga biznesingizni rivojlantirish, mijozlarni jalb qilish va " + "daromadni oshirishda yordam beraman.\n\n" + "━━━━━━━━━━━━━━━━━━━\n\n" + "🎯 <b>Nima qilaman:</b>\n" + "✔️ Marketing strategiya\n" + "✔️ Mijozlar jalb qilish\n" + "✔️ Brend rivojlantirish\n" + "✔️ Reklama kampaniyalari\n\n" + "💰 <b>Narxlar haqida:</b>\n" + "• 50$ dan yuqori\n" + "• 100$ dan yuqori\n" + "• 300$ dan yuqori\n\n" + "━━━━━━━━━━━━━━━━━━━\n\n" + "👇 <b>Quyidagilardan birini tanlang:</b>";

  await ctx.replyWithHTML(welcomeText, mainMenuKeyboard);
});

// ==================== MENU & HELP ====================

bot.hears(["🔙 Asosiy menyu", "🏠 Asosiy menyu", "/menu"], async (ctx) => {
  initSession(ctx);
  await ctx.replyWithHTML("🏠 <b>Asosiy menyu</b>\n\nYo'nalishlardan birini tanlang:", mainMenuKeyboard);
});

bot.hears(["ℹ️ Yordam", "/help"], async (ctx) => {
  const helpText = "📘 <b>BOT BILAN QANDAY ISHLASH:</b>\n\n" + "1️⃣ Kasbingizni tanlang\n" + "2️⃣ Muammoni belgilang\n" + "3️⃣ Taklifni ko'ring\n" + "4️⃣ Kontakt yuboring\n" + "5️⃣ Biz 2-3 soat ichida bog'lanamiz\n\n" + "━━━━━━━━━━━━━━━━━━━\n\n" + "💰 <b>Narxlar:</b> 50$ - 300$+\n" + "⏰ <b>Muddat:</b> 2 hafta - 3 oy\n" + "✅ <b>Kafolat:</b> Shartnomada belgilanadi\n\n" + "📞 Kontakt yuboring va biz sizga batafsil ma'lumot beramiz!";

  await ctx.replyWithHTML(helpText);
});

// ==================== ROLE SELECTION (1-QADAM) ====================

bot.hears(Object.values(ROLES), async (ctx) => {
  initSession(ctx);
  const selectedRole = ctx.message.text;
  ctx.session.selectedRole = selectedRole;
  ctx.session.offerShown = false;

  await ctx.sendChatAction("typing");
  await new Promise((resolve) => setTimeout(resolve, 500));

  const responseText = `<b>${selectedRole}</b>\n\n` + "✅ <b>Ajoyib tanlov!</b>\n\n" + "Hozirgi vaqtda sizni eng ko'p qaysi muammo qiynaydi?\n\n" + "👇 <b>Tanlang:</b>";

  await ctx.replyWithHTML(responseText, problemsKeyboard);
});

// ==================== PROBLEM SELECTION (2-QADAM) ====================

bot.action(/^prob_/, async (ctx) => {
  await ctx.answerCbQuery("⏳ Taklif tayyorlanmoqda...");
  initSession(ctx);

  const problemKey = ctx.match.input;
  const problem = Object.values(PROBLEMS).find((p) => p.key === problemKey);

  if (!problem) return;

  ctx.session.selectedProblem = problem.text;

  // Tahlil xabari
  const analysisText = "2️⃣ <b>Tushunarli 👍</b>\n\n" + "🔍 <b>Tahlil qilinmoqda...</b>\n\n" + `📋 Kasbingiz: ${ctx.session.selectedRole}\n` + `🎯 Muammo: ${problem.text}\n\n` + "⏳ Sizga maxsus yechim tayyorlanmoqda...";

  await ctx.replyWithHTML(analysisText);

  await ctx.sendChatAction("typing");
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Taklif tayyorlandi (3-QADAM)
  const offerText = "3️⃣ <b>✅ Maxsus yechim tayyorlandi!</b>\n\n" + `📋 Yo'nalish: ${ctx.session.selectedRole}\n` + `🎯 Muammo: ${problem.text}\n\n` + "━━━━━━━━━━━━━━━━━━━\n\n" + "⚡ <b>[Mini taklif / xizmat paketi]</b>\n\n" + "Men sizning muammoingizni tez va samarali hal qilish uchun " + "maxsus yechim tayyorladim.\n\n" + "🔥 <b>Sizga mos paket:</b>\n" + "• Tezkor natija\n" + "• Professional yondashuv\n" + "• Kafolatlangan sifat\n\n" + "👇 <b>Davom eting:</b>";

  await ctx.replyWithHTML(offerText, offerActionsKeyboard);
});

// ==================== OFFER ACTIONS ====================

bot.action("offer_view", async (ctx) => {
  await ctx.answerCbQuery("📄 Taklif yuklanmoqda...");
  initSession(ctx);

  const filePath = path.join(__dirname, "offer.pdf");

  try {
    await ctx.replyWithDocument(
      {
        source: filePath,
        filename: `Taklif_${ctx.session.selectedRole?.replace(/[^\w]/g, "") || "Umumiy"}.pdf`,
      },
      {
        caption: "📄 <b>Sizning maxsus taklifingiz</b>\n\n" + "✅ Taklifni saqlang va o'qib chiqing\n" + "💡 Savollar bo'lsa, biz bilan bog'laning",
        parse_mode: "HTML",
      }
    );

    ctx.session.offerShown = true;

    // 4-QADAM: Qo'shimcha afzalliklar va kontakt so'rash
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const additionalBenefitsText = "4️⃣ <b>Mana siz uchun maxsus rivoj botimiz qo'shimcha yechimlari</b> 👇\n\n" + "🔥 <b>Afzalliklari:</b>\n" + "✔️ Tezkor natija\n" + "✔️ Mutaxassis yondashuvi\n" + "✔️ Shaxsiy yordam\n\n" + "👉 Aloqaga chiqish uchun tugmani bosing:";

    await ctx.replyWithHTML(additionalBenefitsText, contactRequestKeyboard);
  } catch (error) {
    console.error("PDF yuklashda xato:", error.message);

    const textOffer = "📄 <b>TAKLIFLAR RO'YXATI</b>\n\n" + "💎 Mini: 50$+ | 2 hafta\n" + "⭐ Standart: 100$+ | 1 oy\n" + "👑 Premium: 300$+ | 3 oy\n\n" + "Batafsil ma'lumot uchun kontakt yuboring!";

    await ctx.replyWithHTML(textOffer);

    ctx.session.offerShown = true;

    // 4-QADAM: Qo'shimcha afzalliklar
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const additionalBenefitsText = "4️⃣ <b>Mana siz uchun maxsus rivoj botimiz qo'shimcha yechimlari</b> 👇\n\n" + "🔥 <b>Afzalliklari:</b>\n" + "✔️ Tezkor natija\n" + "✔️ Mutaxassis yondashuvi\n" + "✔️ Shaxsiy yordam\n\n" + "👉 Aloqaga chiqish uchun tugmani bosing:";

    await ctx.replyWithHTML(additionalBenefitsText, contactRequestKeyboard);
  }
});

bot.action("offer_details", async (ctx) => {
  await ctx.answerCbQuery("ℹ️ Ma'lumot yuklanmoqda...");
  initSession(ctx);

  const detailsText = "ℹ️ <b>BATAFSIL MA'LUMOT</b>\n\n" + `📋 Yo'nalish: ${ctx.session.selectedRole}\n` + `🎯 Muammo: ${ctx.session.selectedProblem}\n\n` + "━━━━━━━━━━━━━━━━━━━\n\n" + "🔥 <b>BIZNING YONDASHUV:</b>\n\n" + "1️⃣ Chuqur tahlil va tadqiqot\n" + "2️⃣ Maxsus strategiya yaratish\n" + "3️⃣ Professional amalga oshirish\n" + "4️⃣ Natijalarni doimiy kuzatish\n\n" + "━━━━━━━━━━━━━━━━━━━\n\n" + "✅ Kafolatlangan natija\n" + "✅ Tajribali jamoa\n" + "✅ 24/7 qo'llab-quvvatlash\n\n" + "📲 Kontakt yuboring va boshlaymiz!";

  await ctx.replyWithHTML(detailsText);

  ctx.session.offerShown = true;

  // 4-QADAM: Qo'shimcha afzalliklar
  await new Promise((resolve) => setTimeout(resolve, 800));

  const additionalBenefitsText = "4️⃣ <b>Mana siz uchun maxsus rivoj botimiz qo'shimcha yechimlari</b> 👇\n\n" + "🔥 <b>Afzalliklari:</b>\n" + "✔️ Tezkor natija\n" + "✔️ Mutaxassis yondashuvi\n" + "✔️ Shaxsiy yordam\n\n" + "👉 Aloqaga chiqish uchun tugmani bosing:";

  await ctx.replyWithHTML(additionalBenefitsText, contactRequestKeyboard);
});

bot.action("back_to_problems", async (ctx) => {
  await ctx.answerCbQuery("🔙 Orqaga");

  const responseText = `1️⃣ <b>${ctx.session.selectedRole || "Yo'nalish"}</b>\n\n` + "Boshqa muammoni tanlang:\n\n" + "👇 <b>Tanlang:</b>";

  await ctx.replyWithHTML(responseText, problemsKeyboard);
});

// ==================== CONTACT HANDLING (5-QADAM) ====================

bot.on("contact", async (ctx) => {
  initSession(ctx);

  const contact = ctx.message.contact;
  ctx.session.contact = contact;

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

  // Rahmat xabari
  await ctx.sendChatAction("typing");
  await new Promise((resolve) => setTimeout(resolve, 800));

  const thankYouText = `✅ <b>Ajoyib, ${firstName}!</b>\n\n` + `📞 Telefon raqamingiz qabul qilindi:\n<code>${phone}</code>\n\n` + "━━━━━━━━━━━━━━━━━━━\n\n" + "⏰ <b>Keyingi 2-3 soat ichida</b> bizning mutaxassislarimiz " + "siz bilan bog'lanadi!\n\n" + "🎯 <b>Biz siz bilan:</b>\n" + "• Muammolaringizni muhokama qilamiz\n" + "• Eng mos yechimni taklif qilamiz\n" + "• Maxsus narx va shartlarni kelishamiz\n" + "• Barcha savollaringizga javob beramiz\n\n" + "━━━━━━━━━━━━━━━━━━━\n\n" + "🔥 <b>MAXSUS IMKONIYATLAR:</b>\n\n" + "✔️ Tezkor natija (1-2 haftada)\n" + "✔️ Mutaxassis yondashuvi\n" + "✔️ Shaxsiy yordam va menejer\n" + "✔️ Kafolatlangan sifat\n" + "✔️ 24/7 qo'llab-quvvatlash\n\n" + "💡 <i>Rahmat! Tez orada gaplashamiz!</i>";

  await ctx.replyWithHTML(thankYouText, mainMenuKeyboard);

  // Admin uchun bildirishnoma
  if (ADMIN_ID) {
    const adminNotification = "🔔 <b>YANGI LEAD QABUL QILINDI!</b>\n\n" + "━━━━━━━━━━━━━━━━━━━\n\n" + "👤 <b>Mijoz:</b>\n" + `• Ism: <b>${firstName}</b>\n` + `• Telefon: <code>${phone}</code>\n` + `• User ID: <code>${ctx.from.id}</code>\n` + `• Username: ${ctx.from.username ? "@" + ctx.from.username : "❌ Yo'q"}\n\n` + "━━━━━━━━━━━━━━━━━━━\n\n" + "📊 <b>Ma'lumotlar:</b>\n" + `💼 Kasb: <b>${ctx.session.selectedRole || "Ko'rsatilmagan"}</b>\n` + `🎯 Muammo: <b>${ctx.session.selectedProblem || "Ko'rsatilmagan"}</b>\n\n` + "━━━━━━━━━━━━━━━━━━━\n\n" + `⏰ Vaqt: ${formatDate(new Date().toISOString())}\n\n` + "⚡ <b>Tez bog'lanish tavsiya etiladi!</b>";

    try {
      await ctx.telegram.sendMessage(ADMIN_ID, adminNotification, {
        parse_mode: "HTML",
      });
      await ctx.telegram.sendMessage(GROUP_ID, adminNotification, {
        parse_mode: "HTML",
      });
    } catch (e) {
      console.error("❌ Admin ga xabar yuborishda xato:", e.message);
    }
  }
});

// ==================== PRICES ====================

bot.hears("💰 Narxlar", async (ctx) => {
  await ctx.reply("💰 <b>Narxlar bo'yicha ma'lumot:</b>\n\nDiapazondan tanlang:", {
    parse_mode: "HTML",
    ...pricesKeyboard,
  });
});

bot.action(["price_50", "price_100", "price_300"], async (ctx) => {
  await ctx.answerCbQuery("💰 Narx ma'lumotlari");

  const priceInfo = {
    price_50: {
      text: "💎 <b>MINI PAKET: 50$ - 90$</b>\n\n" + "⏱ Muddat: 2 hafta\n\n" + "<b>Xizmatlar:</b>\n" + "✔️ Biznes tahlili\n" + "✔️ Marketing strategiya\n" + "✔️ 2 ta professional kontent\n" + "✔️ Bepul konsultatsiya\n\n" + "<b>Natija:</b>\n" + "📈 Sotuvning 15-25% oshishi\n" + "🎯 50-100 yangi mijoz",
    },
    price_100: {
      text: "⭐ <b>STANDART PAKET: 100$ - 200$</b>\n\n" + "⏱ Muddat: 1 oy\n\n" + "<b>Xizmatlar:</b>\n" + "✔️ To'liq marketing strategiya\n" + "✔️ 4 ta premium kontent\n" + "✔️ Reklama kampaniyasi\n" + "✔️ Haftalik konsultatsiya\n\n" + "<b>Natija:</b>\n" + "📈 Sotuvning 30-50% oshishi\n" + "🎯 200-500 yangi mijoz\n" + "💰 Daromadning 2x oshishi",
    },
    price_300: {
      text: "👑 <b>PREMIUM PAKET: 300$+</b>\n\n" + "⏱ Muddat: 3 oy\n\n" + "<b>VIP xizmatlar:</b>\n" + "✔️ Kompleks brend strategiya\n" + "✔️ 12 ta eksklyuziv kontent\n" + "✔️ To'liq SMM boshqarish\n" + "✔️ Shaxsiy menejer 24/7\n\n" + "<b>Natija:</b>\n" + "📈 Sotuvning 60-100%+ oshishi\n" + "🎯 500-1000+ premium mijoz\n" + "💰 Daromadning 3-5x oshishi\n" + "🏆 Bozorda №1 pozitsiya",
    },
  };

  const selected = priceInfo[ctx.match[0]];
  await ctx.replyWithHTML(selected.text);

  await new Promise((resolve) => setTimeout(resolve, 800));
  await ctx.replyWithHTML("📞 <b>Xizmatdan foydalanish uchun:</b>\n\n" + "Kontakt yuboring va biz sizga:\n" + "✅ 2 soat ichida javob beramiz\n" + "✅ Bepul konsultatsiya\n" + "✅ Maxsus narx taklif qilamiz", contactRequestKeyboard);
});

bot.action("price_back", async (ctx) => {
  await ctx.answerCbQuery("🔙 Orqaga");
  await ctx.reply("🏠 Asosiy menyu", mainMenuKeyboard);
});

// ==================== ADMIN PANEL ====================

bot.command("admin", async (ctx) => {
  if (!ADMIN_ID || ctx.from.id.toString() !== ADMIN_ID.toString()) {
    return ctx.reply("❌ Sizda admin huquqi yo'q!");
  }

  await ctx.reply("🔐 <b>ADMIN PANEL</b>\n\nFunksiyalarni tanlang:", {
    parse_mode: "HTML",
    ...adminKeyboard,
  });
});

bot.action("admin_stats", async (ctx) => {
  if (!ADMIN_ID || ctx.from.id.toString() !== ADMIN_ID.toString()) {
    return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  }

  await ctx.answerCbQuery("📊 Yuklanmoqda...");

  const stats = getStats();

  const roleStats = Object.entries(stats.byRole)
    .map(([role, count]) => `  • ${role}: ${count}`)
    .join("\n");

  const problemStats = Object.entries(stats.byProblem)
    .map(([problem, count]) => `  • ${problem}: ${count}`)
    .join("\n");

  const statsText = "📊 <b>BOT STATISTIKASI</b>\n\n" + "━━━━━━━━━━━━━━━━━━━\n\n" + `📈 Jami leadlar: ${stats.total}\n` + `🆕 Bugun: ${stats.today}\n\n` + "━━━━━━━━━━━━━━━━━━━\n\n" + "👥 <b>Kasblar:</b>\n" + `${roleStats || "  Ma'lumot yo'q"}\n\n` + "━━━━━━━━━━━━━━━━━━━\n\n" + "🎯 <b>Muammolar:</b>\n" + `${problemStats || "  Ma'lumot yo'q"}\n\n` + "━━━━━━━━━━━━━━━━━━━\n\n" + `⏰ ${formatDate(new Date().toISOString())}`;

  await ctx.replyWithHTML(statsText, adminKeyboard);
});

bot.action("admin_leads", async (ctx) => {
  if (!ADMIN_ID || ctx.from.id.toString() !== ADMIN_ID.toString()) {
    return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  }

  await ctx.answerCbQuery("📋 Yuklanmoqda...");

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

  // CSV yaratish
  const csvHeader = "ID,Ism,Telefon,Kasb,Muammo,Vaqt\n";
  const csvRows = leads
    .map((lead) => {
      return `${lead.id},"${lead.firstName}","${lead.phone}","${lead.role}","${lead.problem}","${formatDate(lead.timestamp)}"`;
    })
    .join("\n");

  const csvContent = csvHeader + csvRows;
  const csvBuffer = Buffer.from(csvContent, "utf-8");

  try {
    await ctx.replyWithDocument(
      {
        source: csvBuffer,
        filename: `Leads_${new Date().toISOString().split("T")[0]}.csv`,
      },
      {
        caption: `📊 <b>Jami ${leads.length} ta lead</b>\n\n✅ Muvaffaqiyatli export qilindi!`,
        parse_mode: "HTML",
      }
    );
  } catch (error) {
    console.error("CSV export xatosi:", error.message);
    await ctx.reply("❌ Export qilishda xatolik yuz berdi.");
  }
});

bot.action("admin_refresh", async (ctx) => {
  if (!ADMIN_ID || ctx.from.id.toString() !== ADMIN_ID.toString()) {
    return ctx.answerCbQuery("❌ Ruxsat yo'q!");
  }

  await ctx.answerCbQuery("🔄 Yangilanmoqda...");

  const stats = getStats();

  const roleStats = Object.entries(stats.byRole)
    .map(([role, count]) => `  • ${role}: ${count}`)
    .join("\n");

  const problemStats = Object.entries(stats.byProblem)
    .map(([problem, count]) => `  • ${problem}: ${count}`)
    .join("\n");

  const statsText = "📊 <b>BOT STATISTIKASI</b>\n\n" + "━━━━━━━━━━━━━━━━━━━\n\n" + `📈 Jami leadlar: ${stats.total}\n` + `🆕 Bugun: ${stats.today}\n\n` + "━━━━━━━━━━━━━━━━━━━\n\n" + "👥 <b>Kasblar:</b>\n" + `${roleStats || "  Ma'lumot yo'q"}\n\n` + "━━━━━━━━━━━━━━━━━━━\n\n" + "🎯 <b>Muammolar:</b>\n" + `${problemStats || "  Ma'lumot yo'q"}\n\n` + "━━━━━━━━━━━━━━━━━━━\n\n" + `⏰ ${formatDate(new Date().toISOString())}`;

  await ctx.editMessageText(statsText, {
    parse_mode: "HTML",
    ...adminKeyboard,
  });
});

// ==================== ERROR HANDLING ====================

bot.catch((err, ctx) => {
  console.error(`❌ Xatolik [${ctx.updateType}]:`, err);
});

// ==================== LAUNCH ====================

bot.launch(async () => {
  await bot.telegram.sendMessage(ADMIN_ID, "✅ Bot ishga tushdi!");
  console.log("✅ Bot ishga tushdi!");
  console.log("📊 Statistika: /admin");
  console.log("🔄 To'xtatish: Ctrl+C");
});

// Graceful shutdown
process.once("SIGINT", async () => {
  await bot.telegram.sendMessage(ADMIN_ID, "⏸ Bot to'xtatildi");
  console.log("\n⏸ Bot to'xtatilmoqda...");
  bot.stop("SIGINT");
});

process.once("SIGTERM", async () => {
  console.log("\n⏸ Bot to'xtatilmoqda...");
  await bot.telegram.sendMessage(ADMIN_ID, "⏸ Bot to'xtatildi");
  bot.stop("SIGTERM");
});
