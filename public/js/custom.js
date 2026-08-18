// --- Lógica do Header (com proteção) ---
const header = document.querySelector("header");
const sectionOne = document.querySelector(".change-name");

if (header && sectionOne) {
  const sectionOneOptions = {
    rootMargin: "400px 0px 0px 0px"
  };

  const sectionOneObserver = new IntersectionObserver(function (entries) {
    entries.forEach(entry => {
      if (!entry.isIntersecting) {
        header.classList.add("nav-scrolled");
      } else {
        header.classList.remove("nav-scrolled");
      }
    });
  }, sectionOneOptions);

  sectionOneObserver.observe(sectionOne);
} else {
  console.warn("Aviso: Header ou .change-name não encontrados nesta página.");
}