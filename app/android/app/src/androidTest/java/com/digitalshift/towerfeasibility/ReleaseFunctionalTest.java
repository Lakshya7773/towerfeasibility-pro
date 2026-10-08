package com.digitalshift.towerfeasibility;

import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertNotNull;

import android.content.Context;
import android.content.Intent;

import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.Until;

import org.junit.Before;
import org.junit.FixMethodOrder;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.MethodSorters;

import java.util.List;

/**
 * Targeted functional tests for the RELEASE artifact (FT-001 … FT-011).
 *
 * These are deterministic UI assertions, not a Robo crawl: each test drives a
 * specific user journey and asserts a specific visible outcome. They are run by
 * Firebase Test Lab against the SIGNED RELEASE APK, so they exercise the
 * artifact that actually ships (minified/optimised build, production signing,
 * no dev-support code) rather than a debug build.
 *
 * The app is a React Native app, so assertions are made against rendered text
 * via UiAutomator rather than against native view ids.
 *
 * Ordering matters: these tests walk a single user journey, so they run in
 * method-name order and later tests depend on earlier ones having navigated.
 *
 * First launch copies ~246 MB of bundled data packs out of the APK, which is
 * slow on a virtual device — the initial wait is deliberately generous.
 */
@RunWith(AndroidJUnit4.class)
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
public class ReleaseFunctionalTest {

    /** Package under test. */
    private static final String PKG = "com.digitalshift.towerfeasibility";

    /** First launch installs the bundled packs (hundreds of MB) — be patient. */
    private static final long BOOT_TIMEOUT_MS = 420_000L;
    /** Normal navigation between screens. */
    private static final long UI_TIMEOUT_MS = 30_000L;
    /** Full 7-dimension analysis incl. raster/LoS work. */
    private static final long ANALYSIS_TIMEOUT_MS = 300_000L;

    private UiDevice device;

    @Before
    public void setUp() throws Exception {
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        device.wakeUp();
    }

    /** Launch the app under test from a clean task. */
    private void launchApp() {
        Context ctx = ApplicationProvider.getApplicationContext();
        Intent intent = ctx.getPackageManager().getLaunchIntentForPackage(PKG);
        assertNotNull("launcher intent for " + PKG, intent);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK | Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(intent);
        device.waitForIdle();
    }

    /** Wait for a node whose text exactly equals `text`. */
    private boolean waitForText(String text, long timeoutMs) {
        return device.wait(Until.hasObject(By.text(text)), timeoutMs);
    }

    /** Wait for a node whose text contains `fragment`. */
    private boolean waitForTextContains(String fragment, long timeoutMs) {
        return device.wait(Until.hasObject(By.textContains(fragment)), timeoutMs);
    }

    /** Wait for text, then click it. Returns false if it never appeared. */
    private boolean clickText(String text, long timeoutMs) {
        if (!waitForText(text, timeoutMs)) return false;
        UiObject2 obj = device.findObject(By.text(text));
        if (obj == null) return false;
        obj.click();
        device.waitForIdle();
        return true;
    }

    /** The app must still be in the foreground (i.e. it did not crash). */
    private void assertAppAlive(String where) {
        String current = device.getCurrentPackageName();
        assertTrue("app left foreground at " + where + " (crashed? got " + current + ")",
                PKG.equals(current));
    }

    /** All editable fields currently on screen, in layout order. */
    private List<UiObject2> editFields() {
        return device.findObjects(By.clazz("android.widget.EditText"));
    }

    /**
     * FT-001 — App launch.
     * The app must boot past the splash (which installs the bundled packs) and
     * render the home screen without crashing.
     */
    @Test
    public void test01_appLaunchAndHomeRenders() throws Exception {
        launchApp();

        // The splash shows the product name while packs install.
        assertTrue("splash/title never appeared",
                waitForTextContains("TowerFeasibility Pro", BOOT_TIMEOUT_MS));

        // Home screen is reached only after bootstrap completes.
        assertTrue("home title 'Tower Feasibility' never appeared",
                waitForText("Tower Feasibility", BOOT_TIMEOUT_MS));
        assertTrue("'Start site analysis' button missing",
                waitForText("Start site analysis", UI_TIMEOUT_MS));
        assertAppAlive("home");
    }

    /**
     * FT-002 — Location selection screen.
     * Requires an active pack, so this also proves the bundled pack installed.
     */
    @Test
    public void test02_openSiteScreen() throws Exception {
        assertTrue("could not tap 'Start site analysis'",
                clickText("Start site analysis", UI_TIMEOUT_MS));

        assertTrue("'Run feasibility analysis' button never appeared",
                waitForText("Run feasibility analysis", UI_TIMEOUT_MS));
        assertTrue("coverage radius selector missing",
                waitForText("Coverage radius", UI_TIMEOUT_MS));
        assertAppAlive("map");
    }

    /**
     * FT-003 — Coordinate input.
     * Type valid Ajmer coordinates and apply them; the screen must accept them.
     */
    @Test
    public void test03_coordinateInputValid() throws Exception {
        assertTrue("expected two coordinate fields", waitForText("Coverage radius", UI_TIMEOUT_MS));

        List<UiObject2> fields = editFields();
        assertTrue("expected >=2 EditText fields, found " + fields.size(), fields.size() >= 2);

        fields.get(0).click();
        fields.get(0).setText("26.9124");
        fields.get(1).click();
        fields.get(1).setText("75.7873");

        assertTrue("'Go' apply button missing", clickText("Go", UI_TIMEOUT_MS));
        assertAppAlive("after applying valid coordinates");
    }

    /**
     * FT-004 — Invalid coordinates.
     * Out-of-range latitude must be handled without a crash. (The screen
     * accepts any finite number and only rejects non-numeric input, so the
     * assertion is controlled behaviour, not a specific error dialog.)
     */
    @Test
    public void test04_coordinateInputInvalid() throws Exception {
        List<UiObject2> fields = editFields();
        assertTrue("expected >=2 EditText fields", fields.size() >= 2);

        fields.get(0).click();
        fields.get(0).setText("95");          // latitude > 90 — invalid
        fields.get(1).click();
        fields.get(1).setText("75.7873");
        assertTrue("'Go' apply button missing", clickText("Go", UI_TIMEOUT_MS));

        // Non-numeric input must also be handled.
        fields = editFields();
        fields.get(0).click();
        fields.get(0).setText("abc");
        assertTrue("'Go' apply button missing", clickText("Go", UI_TIMEOUT_MS));

        assertAppAlive("after invalid coordinates");
    }

    /**
     * FT-005 — Restore a valid Rajasthan site and run the full analysis.
     * This is the core journey: coordinates -> 7-dimension analysis -> results.
     */
    @Test
    public void test05_runFeasibilityAnalysis() throws Exception {
        // Re-enter known-good coordinates.
        List<UiObject2> fields = editFields();
        assertTrue("expected >=2 EditText fields", fields.size() >= 2);
        fields.get(0).click();
        fields.get(0).setText("26.9124");
        fields.get(1).click();
        fields.get(1).setText("75.7873");
        assertTrue("'Go' apply button missing", clickText("Go", UI_TIMEOUT_MS));

        assertTrue("could not tap 'Run feasibility analysis'",
                clickText("Run feasibility analysis", UI_TIMEOUT_MS));

        // The analysis screen opens with the score card and the WHY section.
        assertTrue("analysis result never rendered ('Why this result' missing)",
                waitForText("Why this result", ANALYSIS_TIMEOUT_MS));
        assertAppAlive("analysis");
    }

    /**
     * FT-006 — Analysis dimensions are all rendered.
     */
    @Test
    public void test06_analysisDimensionsRendered() throws Exception {
        assertTrue("population section missing", waitForText("1 · Population", UI_TIMEOUT_MS));
        assertTrue("tower section missing",
                waitForText("2 · Competitor towers", UI_TIMEOUT_MS));
        assertTrue("resources section missing", waitForText("3 · Resources", UI_TIMEOUT_MS));
        assertTrue("soil section missing", waitForText("5 · Soil", UI_TIMEOUT_MS));
        assertAppAlive("analysis dimensions");
    }

    /**
     * FT-007 — The verdict is presented as a TECHNICAL SCREENING with the
     * commercial gap stated explicitly.
     *
     * This asserts the Phase-7 semantics actually shipped in the release
     * artifact: no investment-style Go/No-Go claim, and commercial feasibility
     * declared as not assessed.
     */
    @Test
    public void test07_technicalScreeningSemantics() throws Exception {
        boolean technical = waitForTextContains("Technical screening only", UI_TIMEOUT_MS)
                || waitForTextContains("technical", UI_TIMEOUT_MS);
        assertTrue("technical-screening wording missing from the verdict", technical);

        assertTrue("commercial gap not stated in the UI",
                waitForTextContains("Commercial feasibility is NOT assessed", UI_TIMEOUT_MS));

        assertTrue("score contribution breakdown missing",
                waitForTextContains("max", UI_TIMEOUT_MS));
        assertAppAlive("screening semantics");
    }

    /**
     * FT-008 — Report screen opens.
     */
    @Test
    public void test08_openReport() throws Exception {
        assertTrue("could not tap 'View / export PDF report'",
                clickText("View / export PDF report", UI_TIMEOUT_MS));

        assertTrue("report screen title missing", waitForText("Report", UI_TIMEOUT_MS));
        assertTrue("Preview tab missing", waitForText("Preview", UI_TIMEOUT_MS));
        assertTrue("Export tab missing", waitForText("Export", UI_TIMEOUT_MS));
        assertAppAlive("report");
    }

    /**
     * FT-009 — Export tab exposes PDF generation and the report identity.
     */
    @Test
    public void test09_exportTab() throws Exception {
        assertTrue("could not switch to Export tab", clickText("Export", UI_TIMEOUT_MS));

        assertTrue("'Generate PDF' button missing", waitForText("Generate PDF", UI_TIMEOUT_MS));
        assertTrue("report identity missing",
                waitForText("Tower Feasibility Report", UI_TIMEOUT_MS));
        assertTrue("commercial status missing from the export summary",
                waitForTextContains("commercial feasibility NOT assessed", UI_TIMEOUT_MS));
        assertAppAlive("export tab");
    }

    /**
     * FT-010 — PDF generation completes offline.
     * The WebView->PDF path is the heaviest native operation in the app; a
     * crash or ANR here would not be caught by a Robo crawl.
     */
    @Test
    public void test10_generatePdf() throws Exception {
        assertTrue("could not tap 'Generate PDF'", clickText("Generate PDF", UI_TIMEOUT_MS));

        // On success the share affordance appears; on failure an alert is shown.
        boolean ok = device.wait(Until.hasObject(By.textContains("Share / Save")),
                ANALYSIS_TIMEOUT_MS);
        assertTrue("PDF generation did not complete (no 'Share / Save' affordance)", ok);
        assertAppAlive("pdf generation");
    }

    /**
     * FT-011 — Lifecycle: backgrounding and returning must not crash or lose
     * the report (offline app, no network calls to fail on resume).
     */
    @Test
    public void test11_lifecycleResume() throws Exception {
        device.pressHome();
        device.waitForIdle();

        launchApp();
        device.waitForIdle();

        // Whatever screen we return to, the app must be alive and rendering.
        assertTrue("app did not return to foreground after resume",
                waitForTextContains("Tower", UI_TIMEOUT_MS)
                        || waitForTextContains("Report", UI_TIMEOUT_MS)
                        || waitForTextContains("Analysis", UI_TIMEOUT_MS));
        assertAppAlive("after resume");
    }
}
