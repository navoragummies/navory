document.addEventListener("DOMContentLoaded", () => {

  const screens = Array.from(document.querySelectorAll(".screen"));
  const tabs = Array.from(document.querySelectorAll(".tab"));
  const dots = Array.from(document.querySelectorAll(".dot"));
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const whatsappFab = document.querySelector(".whatsapp-fab");

  let current = 0;

  function setStaggerDelays(panelIndex) {
    const els = screens[panelIndex].querySelectorAll(".reveal");
    els.forEach((el, i) => el.style.setProperty("--d", i));
  }

  function goTo(index) {
    if (index < 0 || index >= screens.length || index === current) return;

    screens[current].classList.remove("is-active");
    tabs[current].classList.remove("is-active");
    tabs[current].setAttribute("aria-selected", "false");
    dots[current].classList.remove("is-active");

    current = index;
    setStaggerDelays(current);

    screens[current].classList.add("is-active");
    tabs[current].classList.add("is-active");
    tabs[current].setAttribute("aria-selected", "true");
    dots[current].classList.add("is-active");

    // en Contacto ya hay un botón de WhatsApp grande: ocultamos el flotante
    // para que no se superponga con él.
    whatsappFab?.classList.toggle("is-hidden", current === 2);
  }

  document.querySelectorAll("[data-goto]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      goTo(parseInt(el.getAttribute("data-goto"), 10));
    });
  });

  prevBtn.addEventListener("click", () => goTo(current - 1));
  nextBtn.addEventListener("click", () => goTo(current + 1));

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") goTo(current + 1);
    if (e.key === "ArrowLeft") goTo(current - 1);
  });

  setStaggerDelays(0);

  // ---- tilt interactivo en los stickers del muro ----
  const cards = document.querySelectorAll(".sticker-card");

  cards.forEach((card) => {
    const baseRot = card.style.getPropertyValue("--rot") || "0deg";

    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const rotateX = ((y - cy) / cy) * -10;
      const rotateY = ((x - cx) / cx) * 10;
      card.style.transform =
        `translateY(-8px) perspective(700px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    });

    card.addEventListener("mouseleave", () => {
      card.style.transform = `rotate(${baseRot})`;
    });
  });

  // ---- confetti al tocar el botón principal ----
  const ctaBtn = document.getElementById("ctaBtn");
  const bits = ["🍬", "✨", "💗", "🍭", "🎀"];

  ctaBtn?.addEventListener("click", () => {
    const rect = ctaBtn.getBoundingClientRect();
    for (let i = 0; i < 10; i++) {
      const bit = document.createElement("span");
      bit.className = "confetti-bit";
      bit.textContent = bits[Math.floor(Math.random() * bits.length)];
      bit.style.left = `${rect.left + rect.width / 2}px`;
      bit.style.top = `${rect.top + rect.height / 2}px`;

      const angle = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * 70;
      const endX = Math.cos(angle) * dist;
      const endY = Math.sin(angle) * dist - 40;
      bit.style.setProperty(
        "--pop-end",
        `translate(${endX}px, ${endY}px) rotate(${Math.random() * 360}deg) scale(0.6)`
      );

      document.body.appendChild(bit);
      setTimeout(() => bit.remove(), 950);
    }
  });
});
