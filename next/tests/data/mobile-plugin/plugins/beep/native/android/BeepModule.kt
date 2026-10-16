package org.example.beep

import dev.zinc.app.ZincCallback
import dev.zinc.plugins.beep.BeepSpec

/** The fixture's module on Android, in Kotlin behind the generated BeepSpec (zinc native-gen --android). */
class BeepModule : BeepSpec {
    override fun ping(): Int = 42

    override fun greet(name: String, loud: Boolean): String {
        val s = "hello $name from Kotlin"
        return if (loud) s.uppercase() else s
    }

    override fun watch(cb: ZincCallback) {
        Thread {
            Thread.sleep(200)
            cb.call(1, "kotlin")
            cb.call(2, "kotlin")
        }.start()
    }
}

/** The fixture's lifecycle subscriber (plugin.json targets.android.lifecycle): ZincActivity calls it. */
class BeepLife : dev.zinc.app.ZincLifecycle {
    override fun onResume(activity: android.app.Activity) {
        android.util.Log.i("zinc", "beep lifecycle resume")
    }
}
