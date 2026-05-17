import React from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import NomiStudioApp from './workbench/NomiStudioApp'
import ShareFullPage from './ui/ShareFullPage'
import OnboardingApp from './onboarding/OnboardingApp'
import { isOnboardingDone } from './onboarding/onboardingFlags'
import { buildStudioUrl } from './utils/appRoutes'
import { getAppRoutePath } from './utils/routes'

function RedirectToStudioOrWelcome(): JSX.Element {
  const location = useLocation()
  if (!isOnboardingDone() && location.pathname === '/') {
    return <Navigate to="/welcome" replace />
  }
  return <Navigate to={`${buildStudioUrl()}${location.search || ''}`} replace />
}

export default function NomiRouterApp(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path={getAppRoutePath('OnboardingApp')} element={<OnboardingApp />} />
        <Route path={getAppRoutePath('NomiStudioApp')} element={<NomiStudioApp />} />
        <Route path={getAppRoutePath('ShareFullPage')} element={<ShareFullPage />} />
        <Route path={getAppRoutePath('RedirectToStudio', '/')} element={<RedirectToStudioOrWelcome />} />
        <Route path={getAppRoutePath('RedirectToStudio', '/workspace/*')} element={<RedirectToStudioOrWelcome />} />
        <Route path={getAppRoutePath('RedirectToStudio', '/oauth/github')} element={<RedirectToStudioOrWelcome />} />
        <Route path={getAppRoutePath('RedirectToStudio', '*')} element={<RedirectToStudioOrWelcome />} />
      </Routes>
    </BrowserRouter>
  )
}
