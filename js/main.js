/**
 * Skywalker e-Solat Kiosk — Marketing Landing Page Script
 * Powers: Live Clock, FAQ Accordion, Mobile Menu, WhatsApp Quotation
 */

document.addEventListener('DOMContentLoaded', () => {

  // ==================== 1. LIVE MALAYSIAN CLOCK ====================
  function updateLiveClock() {
    const now = new Date();
    
    // Malaysian Time format (HH:mm:ss)
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}:${seconds}`;

    // Target elements
    const clockElements = document.querySelectorAll('.live-clock-display');
    clockElements.forEach(el => el.textContent = timeStr);

    // Gregorian & Hijri Date formatting
    const daysMalay = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
    const monthsMalay = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
    
    const dayName = daysMalay[now.getDay()];
    const dateNum = now.getDate();
    const monthName = monthsMalay[now.getMonth()];
    const yearNum = now.getFullYear();

    const dateStr = `${dayName}, ${dateNum} ${monthName} ${yearNum}`;
    const dateElements = document.querySelectorAll('.live-date-display');
    dateElements.forEach(el => el.textContent = dateStr);
  }

  setInterval(updateLiveClock, 1000);
  updateLiveClock();

  // ==================== 2. MOBILE MENU TOGGLE ====================
  const btnMobileMenu = document.getElementById('btnMobileMenu');
  const mobileNavMenu = document.getElementById('mobileNavMenu');

  if (btnMobileMenu && mobileNavMenu) {
    btnMobileMenu.addEventListener('click', () => {
      mobileNavMenu.classList.toggle('hidden');
    });

    // Close when clicking nav links
    mobileNavMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileNavMenu.classList.add('hidden');
      });
    });
  }

  // ==================== 3. FAQ ACCORDION ====================
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const btn = item.querySelector('.faq-question');
    if (btn) {
      btn.addEventListener('click', () => {
        const isActive = item.classList.contains('active');
        // Close all
        faqItems.forEach(i => i.classList.remove('active'));
        // Toggle current
        if (!isActive) {
          item.classList.add('active');
        }
      });
    }
  });

  // ==================== 4. WHATSAPP QUOTATION GENERATOR ====================
  window.requestQuotation = function(packageName) {
    const phoneNumber = "601118712388";
    const message = encodeURIComponent(
      `Assalamualaikum & Salam Hormat Skywalker Consortium,\n\n` +
      `Saya mewakili pihak pengurusan surau/masjid kami, berminat untuk mendapatkan sebut harga rasmi (Quotation) bagi:\n\n` +
      `*Pakej*: ${packageName}\n\n` +
      `Mohon pihak tuan kongsikan maklumat lanjut, sebut harga pdf, dan cadangan tarikh demonstrasi di lokasi.\n\n` +
      `Terima kasih.`
    );
    window.open(`https://wa.me/${phoneNumber}?text=${message}`, '_blank');
  };

});
