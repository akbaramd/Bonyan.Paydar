import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { failed: boolean }

/** A broken lazy route must not leave the monitoring UI permanently blank. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="fatal-error" role="alert">
          <h1>بارگذاری این بخش با مشکل مواجه شد</h1>
          <p>نسخه برنامه یا بخشی از کد رابط کاربری در دسترس نیست. بازخوانی صفحه معمولاً نسخه جدید را دریافت می‌کند.</p>
          <button type="button" onClick={() => window.location.reload()}>بازخوانی صفحه</button>
        </main>
      )
    }
    return this.props.children
  }
}
