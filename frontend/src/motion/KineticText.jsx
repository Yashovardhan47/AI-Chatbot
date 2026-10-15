import { Children, cloneElement, isValidElement } from "react";

// Keep the actual text and semantic emphasis intact for screen readers, copying
// and search. Wrapping words never changes a heading into an image or canvas.
export default function KineticText({ children }) {
  let position = 0;
  function wrap(nodes) {
    return Children.map(nodes, child => {
      if (typeof child === "string" || typeof child === "number") return String(child).split(/(\s+)/).map((word, index) =>
        !/[\p{L}\p{N}]/u.test(word) ? word : <span key={index} className="ns-type-word" style={{ "--word-index": position++ }}>{word}</span>);
      if (isValidElement(child) && child.props.children !== undefined) return cloneElement(child, {}, wrap(child.props.children));
      return child;
    });
  }
  return <span className="ns-kinetic-text">{wrap(children)}</span>;
}
