/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Paleta oficial del nuevo Design System TuCampus
        primary: {
          DEFAULT: "#0639B8", // Azul principal — headers, botones primary, estados activos
          dark: "#052a8f",
        },
        background: "#FAF8F3", // Fondo base — casi blanco, con un dejo de calidez
        card: "#FFFFFF",       // Tarjetas / superficies
        ink: "#102C4D",        // Texto / azul oscuro
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "24px",
        btn: "20px",
        chip: "999px",
      },
      boxShadow: {
        soft: "0 8px 30px rgba(16, 44, 77, 0.08)",
        softLg: "0 16px 40px rgba(16, 44, 77, 0.12)",
      },
    },
  },
  plugins: [],
};