import { AppRouter } from './app/router'
import { AuthGate } from './app/AuthGate'

export default function App() {
  return <AuthGate><AppRouter /></AuthGate>
}
