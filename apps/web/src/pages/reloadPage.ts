// Its own module so tests can replace it: jsdom's location.reload can't be spied on.
export function reloadPage(): void {
  window.location.reload();
}
