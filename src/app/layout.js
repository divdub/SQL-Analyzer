import "./globals.css";

export const metadata = {
  title: "SQL Analyzer Suite",
  description: "Analyze SQL files and explore SQL dumps",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
