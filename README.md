# Acchi Swipe Camera Test

Phone-first Acchi Muite Hoi-style prototype.

## Camera Test

Use the GitHub Pages URL with:

```text
?phone=1&mode=ai&role=looker
```

That opens the trusted-HTTPS camera test path: tap **Start**, allow camera access, and move your head up, down, left, or right. The avatar should follow your head movement.

## Notes

- GitHub Pages is static, so it can test the camera and computer mode.
- Phone-to-phone rooms still need the Node WebSocket server in `server/rooms.js`.
