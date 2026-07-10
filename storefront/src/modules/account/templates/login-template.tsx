"use client"

import { Suspense, useState } from "react"

import Register from "@modules/account/components/register"
import Login from "@modules/account/components/login"
import ResetPasswordToast from "@modules/account/components/reset-password-toast"

export enum LOGIN_VIEW {
  SIGN_IN = "sign-in",
  REGISTER = "register",
}

const LoginTemplate = () => {
  const [currentView, setCurrentView] = useState("sign-in")

  return (
    <div className="w-full flex justify-start px-8 py-8">
      <Suspense fallback={null}>
        <ResetPasswordToast />
      </Suspense>
      {currentView === "sign-in" ? (
        <Login setCurrentView={setCurrentView} />
      ) : (
        <Register setCurrentView={setCurrentView} />
      )}
    </div>
  )
}

export default LoginTemplate
