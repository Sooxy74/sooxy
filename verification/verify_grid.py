from playwright.sync_api import sync_playwright, Page, expect

def verify_grid(page: Page):
    # Load the page
    page.goto("http://localhost:8000")

    # Wait for canvas to be visible (opacity 1)
    canvas = page.locator("#webgl-canvas")
    expect(canvas).to_have_css("opacity", "1", timeout=10000)

    # Wait a bit for grid generation
    page.wait_for_timeout(2000)

    # Take screenshot
    page.screenshot(path="verification/grid_loaded.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_grid(page)
        finally:
            browser.close()
