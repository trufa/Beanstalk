import React, { HTMLAttributes } from "react";
import styled, { FlattenSimpleInterpolation } from "styled-components";
import { theme, FontWeight, FontColor, FontVariant, FontSize, CssProps } from "src/utils/ui/theme";

export interface TextProps extends HTMLAttributes<HTMLDivElement>, CssProps {
  variant?: FontVariant;
  weight?: FontWeight;
  color?: FontColor;
  size?: FontSize;
  className?: string;
}

/**
 * Standardized Text Component
 * - Defaults to BodySmall
 * - Any additional styles override variant styles
 */
export const Text = React.forwardRef<HTMLDivElement, TextProps>(({ variant, color, size, weight, className, css, ...rest }, ref) => {
  return (
    <TextComponent
      ref={ref}
      $variant={variant ?? "s"}
      $color={color ?? "text.primary"}
      $weight={weight}
      $size={size}
      className={className}
      $css={css}
      {...rest}
    />
  );
});

const TextComponent = styled.div<{
  $variant: FontVariant;
  $size?: FontSize;
  $weight?: FontWeight;
  $color?: FontColor;
  $css?: FlattenSimpleInterpolation;
}>`
  ${(props) => theme.font.styles.variant(props.$variant)}
  ${(props) => props.$size && theme.font.styles.size(props.$size)}
  ${(props) => props.$weight && theme.font.styles.weight(props.$weight)}
  ${(props) => props.$color && theme.font.styles.color(props.$color)}
  ${(props) => props.$css && props.$css}
`;
