import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { CalendarTaskBlock } from './api';

export type DragSource = {
  title: string;
  taskId: string;
  duration: number;
  block?: CalendarTaskBlock;
  draftId?: string;
};

export type DragTarget = { kind: 'queue' } | { kind: 'calendar'; date: string; minute: number };

type Gesture = DragSource & {
  id: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
  offsetY: number;
  moved: boolean;
};

export function useCalendarDrag(onDrop: (source: DragSource, target: DragTarget) => void, topMinute: number, pixelsPerMinute: number) {
  const viewport = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef<number>(0);
  const [drag, setDrag] = useState<Gesture | null>(null);

  const reset = () => {
    gesture.current = null;
    setDrag(null);
    cancelAnimationFrame(frame.current);
    frame.current = 0;
  };

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && gesture.current) reset();
    };
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', escape);
      cancelAnimationFrame(frame.current);
    };
  }, []);

  const scrollWhileDragging = () => {
    const current = gesture.current;
    const element = viewport.current;
    if (!current?.moved) return;
    const box = element?.getBoundingClientRect();
    if (element && box && current.x >= box.left && current.x <= box.right && current.y >= box.top && current.y <= box.bottom) {
      const step = 12;
      const dx = current.x < box.left + 42 ? -step : current.x > box.right - 42 ? step : 0;
      const dy = current.y < box.top + 58 ? -step : current.y > box.bottom - 42 ? step : 0;
      element.scrollBy(dx, dy);
    } else if (current.y < 40 || current.y > window.innerHeight - 40) {
      window.scrollBy(0, current.y < 40 ? -10 : 10);
    }
    frame.current = requestAnimationFrame(scrollWhileDragging);
  };

  const handle = (source: DragSource) => ({
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      if (!event.isPrimary || event.button !== 0 || gesture.current) return;
      const box = (source.block || source.draftId) ? event.currentTarget.closest('.calendar-entry')?.getBoundingClientRect() : null;
      gesture.current = {
        ...source, id: event.pointerId, originX: event.clientX, originY: event.clientY,
        x: event.clientX, y: event.clientY, offsetY: box ? event.clientY - box.top : 0, moved: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event: PointerEvent<HTMLButtonElement>) {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      if (!current.moved && Math.hypot(event.clientX - current.originX, event.clientY - current.originY) < 7) return;
      const next = { ...current, x: event.clientX, y: event.clientY, moved: true };
      gesture.current = next;
      setDrag(next);
      if (!frame.current) frame.current = requestAnimationFrame(scrollWhileDragging);
    },
    onPointerUp(event: PointerEvent<HTMLButtonElement>) {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      const element = current.moved ? document.elementFromPoint(event.clientX, event.clientY) : null;
      const column = element?.closest<HTMLElement>('[data-calendar-date]');
      const date = column?.dataset.calendarDate;
      const queue = element?.closest('[data-calendar-queue]');
      reset();
      if (column && date) {
        const minute = topMinute + (event.clientY - column.getBoundingClientRect().top - current.offsetY) / pixelsPerMinute;
        onDrop(current, { kind: 'calendar', date, minute });
      } else if (queue) {
        onDrop(current, { kind: 'queue' });
      }
    },
    onPointerCancel: reset,
    onLostPointerCapture: reset,
  });

  return { viewport, handle, drag };
}
