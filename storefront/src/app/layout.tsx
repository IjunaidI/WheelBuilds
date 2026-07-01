import { getBaseURL } from "@lib/util/env"
import { Metadata } from "next"
import { Antonio, JetBrains_Mono, Inter } from "next/font/google"
import ProgressBar from "@/components/progress-bar"
import "styles/globals.css"

const antonio = Antonio({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-antonio",
  display: "swap",
})

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
})

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-mode="light"
      className={`${antonio.variable} ${mono.variable} ${inter.variable}`}
    >
      <body>
        <ProgressBar>
          <main className="relative">{props.children}</main>
        </ProgressBar>
      </body>
    </html>
  )
}
