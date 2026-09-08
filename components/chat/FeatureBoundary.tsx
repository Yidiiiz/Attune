// Owns: PROJECT.md §16.7's "degrade one feature, never break the page" — the boundary each optional
// chat surface mounts inside. The sidebar, the annotation gutter, quote replies and read-aloud each
// get their own, so a thrown render in one of them costs that one thing and nothing else.
//
// It is a class because React has no hook form of `componentDidCatch`; that is the whole reason,
// and it is the only class component in the project.
//
// **On failure it unmounts itself rather than rendering a fallback.** §16.7 says so, and the reason
// is worth keeping: a broken sidebar that renders an apology in a 280 px column takes the same room
// as a working one and gives the reader nothing to do about it, while a broken sidebar that is
// simply gone hands its width back to the message column. The toast is what says it happened, and
// unmounting is also what makes it happen once: children that render nothing cannot throw again, so
// a component failing every frame produces one toast rather than one per frame.
//
// Failure behavior: this is the failure behavior. The one thing it must never do is rethrow.

"use client";

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { reportFailure } from "@/components/tasks/writes";

export interface FeatureBoundaryProps {
  /** Named in the toast, so "The sidebar stopped" reads as a sentence about this app. */
  feature: string;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export default class FeatureBoundary extends Component<FeatureBoundaryProps, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The component stack is the useful half of this and it never leaves the console: it names
    // files, and a toast is a place a reader looks, not a place a stack trace belongs.
    console.error(`${this.props.feature} failed`, error, info.componentStack);
    reportFailure(`${this.props.feature} stopped`, error.message || "it will come back on reload");
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
