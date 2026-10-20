// Arena.frame() with and without the size (an optional parameter); the arena is an engine feature, so QuickJS does not run this
{ using a = Arena.frame(); console.log('arena') }
{ using b2 = Arena.frame(1024); console.log('arena2') }
