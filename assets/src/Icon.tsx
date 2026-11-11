import React from 'react';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

// @expo/vector-icons ships with Expo — no extra install needed.
type Props = { name: string; size?: number; color: string; style?: any; mci?: boolean };

export const Icon = ({ name, size = 24, color, style, mci }: Props) =>
  mci ? (
    <MaterialCommunityIcons name={name as any} size={size} color={color} style={style} />
  ) : (
    <Ionicons name={name as any} size={size} color={color} style={style} />
  );