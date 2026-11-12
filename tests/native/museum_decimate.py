import pathlib, subprocess, sys, tempfile
converter=pathlib.Path(sys.argv[1]).resolve(); checker=pathlib.Path(sys.argv[2]).resolve()
with tempfile.TemporaryDirectory() as folder:
    root=pathlib.Path(folder);source=root/'in.obj';output=root/'out.glb'
    valid='v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 .2\nvt 1 .3\nvt 0 .8\nvn .001 0 1\nf 1/1/1 2/2/1 3/3/1\n'
    source.write_text(valid)
    def run(*args,ok):
        result=subprocess.run([str(converter),*map(str,args)],capture_output=True,text=True,timeout=10)
        assert (result.returncode==0)==ok,(args,result.returncode,result.stdout,result.stderr)
    run(source,output,1,'texture.jpg',ok=True);first=output.read_bytes()
    run(source,output,1,'texture.jpg',ok=True);assert output.read_bytes()==first
    subprocess.run([str(checker),str(source),str(output)],check=True,timeout=10)
    original=source.read_bytes()
    for target in ['0','-1','bad','1.5','4294967295']:
        run(source,output,target,'texture.jpg',ok=False);assert output.read_bytes()==first
    for texture in ['../texture.jpg','a"b.jpg','a b.jpg']:
        run(source,output,1,texture,ok=False);assert output.read_bytes()==first
    run(source,source,1,ok=False);assert source.read_bytes()==original
    link=root/'same.glb';link.symlink_to(source);run(source,link,1,'texture.jpg',ok=False);assert source.read_bytes()==original and link.is_symlink()
    for malformed in [valid.replace('1/1/1','0/1/1'),valid.replace('1/1/1','999/1/1'),valid.replace('v 1 0 0','v nan 0 0'),valid+'f 1/1/1 2/2/1 3/3/1 1/1/1\n',valid.replace('vn .001 0 1','vn 0 0 0')]:
        source.write_text(malformed);run(source,output,1,'texture.jpg',ok=False);assert output.read_bytes()==first
    with source.open('wb') as large: large.truncate(64*1024*1024+1)
    run(source,output,1,'texture.jpg',ok=False);assert output.read_bytes()==first
    source.write_text('v '+'1 '*4096+'\n');run(source,output,1,'texture.jpg',ok=False);assert output.read_bytes()==first
    source.write_text(valid)
    directory=root/'directory.glb';directory.mkdir();run(source,directory,1,'texture.jpg',ok=False);assert directory.is_dir()
    run(source,root/'missing'/'out.glb',1,'texture.jpg',ok=False)
    run(source,root/'out.obj',1,ok=True);assert (root/'out.obj').read_text().count('\nf ')==1
    assert not list(root.glob('*.??????')),list(root.iterdir())
print('decimate deterministic GLB, format validity and no-clobber failures passed')
